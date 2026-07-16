import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export interface CreateLibvirtClientOptions {
  uri?: string;
}

export interface LibvirtHealth {
  state: "ready";
  alive: boolean;
  hypervisor: string;
  uri: string;
}

export type DomainState =
  | "running"
  | "blocked"
  | "paused"
  | "shutdown"
  | "shutoff"
  | "crashed"
  | "suspended"
  | "unknown";

export interface DomainSummary {
  id: number | null;
  name: string;
  state: DomainState;
  uuid: string;
}

export interface DomainByUuid {
  uuid: string;
}

export interface DomainByName {
  name: string;
}

export type DomainSelector = DomainByUuid | DomainByName;

export interface LibvirtClient {
  health(): Promise<LibvirtHealth>;
  listDomains(): Promise<DomainSummary[]>;
  getDomain(selector: DomainSelector): Promise<DomainSummary>;
  getDomainXml(selector: DomainSelector): Promise<string>;
  defineDomain(xml: string): Promise<DomainSummary>;
  undefineDomain(selector: DomainSelector): Promise<void>;
  startDomain(selector: DomainSelector): Promise<DomainSummary>;
  shutdownDomain(selector: DomainSelector): Promise<DomainSummary>;
  destroyDomain(selector: DomainSelector): Promise<DomainSummary>;
  rebootDomain(selector: DomainSelector): Promise<DomainSummary>;
  close(): Promise<void>;
}

export type LibvirtAdapterErrorCode =
  | "INITIALIZATION_FAILED"
  | "HOST_ERROR"
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_DEFINITION"
  | "CLOSED_CLIENT";

export class LibvirtAdapterError extends Error {
  readonly code: LibvirtAdapterErrorCode;

  constructor(code: LibvirtAdapterErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LibvirtAdapterError";
    this.code = code;
  }
}

export async function createLibvirtClient(
  options: CreateLibvirtClientOptions = {},
): Promise<LibvirtClient> {
  const uri = normalizeUri(options.uri ?? "qemu:///system");
  await loadWasmContract();

  return HostClient.start(uri);
}

class HostClient implements LibvirtClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #lines: ReadlineInterface;
  readonly #pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  #nextId = 1;
  #closed = false;

  private constructor(
    child: ChildProcessWithoutNullStreams,
    lines: ReadlineInterface,
  ) {
    this.#child = child;
    this.#lines = lines;

    lines.on("line", (line) => this.#handleLine(line));
    child.once("exit", (code, signal) => {
      if (this.#closed) return;
      this.#closed = true;
      const error = new LibvirtAdapterError(
        "HOST_ERROR",
        `native host exited unexpectedly (code=${code}, signal=${signal})`,
      );
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    });
  }

  static async start(uri: string): Promise<HostClient> {
    const hostPath = fileURLToPath(new URL("../native/wasm-libvirt-host", import.meta.url));
    const child = spawn(hostPath, ["--uri", uri], { stdio: ["pipe", "pipe", "pipe"] });
    const lines = createInterface({ input: child.stdout });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    try {
      const ready = await waitForReady(child, lines, () => stderr);
      if (ready.type !== "ready") throw new Error("native host returned an invalid greeting");
      return new HostClient(child, lines);
    } catch (error) {
      child.kill();
      lines.close();
      throw new LibvirtAdapterError(
        "INITIALIZATION_FAILED",
        "failed to initialize native libvirt host",
        { cause: error },
      );
    }
  }

  async health(): Promise<LibvirtHealth> {
    return (await this.#request("health")) as LibvirtHealth;
  }

  async listDomains(): Promise<DomainSummary[]> {
    return (await this.#request("list-domains")) as DomainSummary[];
  }

  async getDomain(selector: DomainSelector): Promise<DomainSummary> {
    if ("uuid" in selector) {
      return (await this.#request("get-domain-by-uuid", selector.uuid)) as DomainSummary;
    }

    return (await this.#request("get-domain-by-name", selector.name)) as DomainSummary;
  }

  async getDomainXml(selector: DomainSelector): Promise<string> {
    if ("uuid" in selector) {
      return (await this.#request("get-domain-xml-by-uuid", selector.uuid)) as string;
    }

    return (await this.#request("get-domain-xml-by-name", selector.name)) as string;
  }

  async defineDomain(xml: string): Promise<DomainSummary> {
    if (xml.includes("\0")) {
      throw new LibvirtAdapterError(
        "INVALID_ARGUMENT",
        "domain XML must not contain NUL bytes",
      );
    }

    const encodedXml = Buffer.from(xml, "utf8").toString("hex");
    return (await this.#request("define-domain", encodedXml)) as DomainSummary;
  }

  async undefineDomain(selector: DomainSelector): Promise<void> {
    if ("uuid" in selector) {
      await this.#request("undefine-domain-by-uuid", selector.uuid);
      return;
    }

    await this.#request("undefine-domain-by-name", selector.name);
  }

  async startDomain(selector: DomainSelector): Promise<DomainSummary> {
    if ("uuid" in selector) {
      return (await this.#request("start-domain-by-uuid", selector.uuid)) as DomainSummary;
    }

    return (await this.#request("start-domain-by-name", selector.name)) as DomainSummary;
  }

  async shutdownDomain(selector: DomainSelector): Promise<DomainSummary> {
    if ("uuid" in selector) {
      return (await this.#request("shutdown-domain-by-uuid", selector.uuid)) as DomainSummary;
    }

    return (await this.#request("shutdown-domain-by-name", selector.name)) as DomainSummary;
  }

  async destroyDomain(selector: DomainSelector): Promise<DomainSummary> {
    if ("uuid" in selector) {
      return (await this.#request("destroy-domain-by-uuid", selector.uuid)) as DomainSummary;
    }

    return (await this.#request("destroy-domain-by-name", selector.name)) as DomainSummary;
  }

  async rebootDomain(selector: DomainSelector): Promise<DomainSummary> {
    if ("uuid" in selector) {
      return (await this.#request("reboot-domain-by-uuid", selector.uuid)) as DomainSummary;
    }

    return (await this.#request("reboot-domain-by-name", selector.name)) as DomainSummary;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    await this.#request("close");
    this.#closed = true;
    this.#lines.close();
  }

  #request(operation: string, argument?: string): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(
        new LibvirtAdapterError("CLOSED_CLIENT", "libvirt client is closed"),
      );
    }

    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      const request = argument === undefined
        ? `${id}\t${operation}\n`
        : `${id}\t${operation}\t${argument}\n`;
      this.#child.stdin.write(request, (error) => {
        if (!error) return;
        this.#pending.delete(id);
        reject(new LibvirtAdapterError("HOST_ERROR", error.message, { cause: error }));
      });
    });
  }

  #handleLine(line: string): void {
    let response: HostResponse;
    try {
      response = JSON.parse(line) as HostResponse;
    } catch {
      return;
    }

    if (typeof response.id !== "number") return;
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      const code = response.code === "NOT_FOUND" ||
        response.code === "CONFLICT" ||
        response.code === "INVALID_DEFINITION"
        ? response.code
        : "HOST_ERROR";
      pending.reject(new LibvirtAdapterError(code, response.error));
    }
  }
}

interface HostResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  code?: string;
  error: string;
}

async function loadWasmContract(): Promise<void> {
  const wasmPath = new URL("../wasm/wasm_core_bg.wasm", import.meta.url);
  const bytes = await readFile(wasmPath);
  const instance = await WebAssembly.instantiate(bytes);
  const version = (instance.instance.exports.adapter_contract_version as (() => number) | undefined)?.();

  if (version !== 1) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      `unsupported WASM contract version: ${String(version)}`,
    );
  }
}

function normalizeUri(uri: string): string {
  const normalized = uri.trim();
  if (!normalized || normalized.includes("\0")) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      "connection URI must be non-empty and contain no NUL bytes",
    );
  }
  return normalized;
}

function waitForReady(
  child: ChildProcessWithoutNullStreams,
  lines: ReadlineInterface,
  readStderr: () => string,
): Promise<{ type: string; uri?: string }> {
  return new Promise((resolve, reject) => {
    const onLine = (line: string) => {
      cleanup();
      try {
        resolve(JSON.parse(line) as { type: string; uri?: string });
      } catch (error) {
        reject(error);
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          readStderr().trim() ||
            `native host exited before ready (code=${code}, signal=${signal})`,
        ),
      );
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      lines.off("line", onLine);
      child.off("exit", onExit);
      child.off("error", onError);
    };

    lines.once("line", onLine);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}
