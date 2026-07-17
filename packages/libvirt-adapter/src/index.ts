import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

/** Параметры создания клиента libvirt. */
export interface CreateLibvirtClientOptions {
  /**
   * Таймаут по умолчанию для операций в миллисекундах.
   * Переопределяется `OperationOptions.timeoutMs` конкретного вызова.
   */
  defaultTimeoutMs?: number;
  /**
   * URI соединения libvirt, например `qemu:///system` или `test:///default`.
   * По умолчанию используется `qemu:///system`.
   */
  uri?: string;
}

/** Дополнительные параметры одного асинхронного вызова. */
export interface OperationOptions {
  /**
   * Сигнал отмены ожидания результата.
   * Отмена не означает откат уже отправленной в libvirt операции.
   */
  signal?: AbortSignal;
  /**
   * Положительный таймаут ожидания в миллисекундах.
   * Имеет приоритет над `CreateLibvirtClientOptions.defaultTimeoutMs`.
   */
  timeoutMs?: number;
}

/** Состояние открытого соединения с libvirt. */
export interface LibvirtHealth {
  /** Всегда `"ready"` для успешно созданного клиента. */
  state: "ready";
  /** Возвращает `true`, когда libvirt считает соединение живым. */
  alive: boolean;
  /** Тип гипервизора, например `"QEMU"` или `"TEST"`. */
  hypervisor: string;
  /** Канонический URI фактически открытого соединения. */
  uri: string;
}

/** Нормализованное состояние домена libvirt. */
export type DomainState =
  | "running"
  | "blocked"
  | "paused"
  | "shutdown"
  | "shutoff"
  | "crashed"
  | "suspended"
  | "unknown";

/** Краткое сериализуемое представление домена. */
export interface DomainSummary {
  /** Runtime ID работающего домена; `null` для неактивного домена. */
  id: number | null;
  /** Имя домена, уникальное в пределах соединения. */
  name: string;
  /** Текущее нормализованное состояние домена. */
  state: DomainState;
  /** Неизменяемый UUID домена. */
  uuid: string;
}

/** Выбор домена по UUID. Не комбинируется с `DomainByName`. */
export interface DomainByUuid {
  /** UUID домена в строковом представлении. */
  uuid: string;
}

/** Выбор домена по имени. Не комбинируется с `DomainByUuid`. */
export interface DomainByName {
  /** Имя домена. */
  name: string;
}

/**
 * Способ выбрать домен. Передавайте ровно одно поле: `{ name }` или `{ uuid }`.
 * Пустые значения, NUL, табуляции и переводы строк отклоняются как
 * `INVALID_ARGUMENT`.
 */
export type DomainSelector = DomainByUuid | DomainByName;

/** Асинхронный клиент для управления одним соединением libvirt. */
export interface LibvirtClient {
  /**
   * Проверяет состояние соединения.
   * @param options Таймаут и сигнал отмены.
   * @returns Сводку о соединении.
   */
  health(options?: OperationOptions): Promise<LibvirtHealth>;
  /**
   * Получает активные и неактивные домены.
   * @param options Таймаут и сигнал отмены.
   * @returns Нормализованный список доменов.
   */
  listDomains(options?: OperationOptions): Promise<DomainSummary[]>;
  /**
   * Находит один домен.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Нормализованное состояние домена.
   * @throws `NOT_FOUND`, если домен отсутствует.
   */
  getDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Возвращает XML-описание домена от libvirt.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns XML в UTF-8 строке.
   */
  getDomainXml(selector: DomainSelector, options?: OperationOptions): Promise<string>;
  /**
   * Создаёт или обновляет persistent-домен из XML.
   * @param xml XML-описание домена без NUL-байтов.
   * @param options Таймаут и сигнал отмены.
   * @returns Нормализованное состояние определённого домена.
   * @throws `INVALID_DEFINITION` для XML, отклонённого libvirt.
   */
  defineDomain(xml: string, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Удаляет persistent-определение домена, но не его storage.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   */
  undefineDomain(selector: DomainSelector, options?: OperationOptions): Promise<void>;
  /**
   * Запускает неактивный домен.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние домена после запуска.
   * @throws `CONFLICT`, если домен уже активен.
   */
  startDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Запрашивает мягкое выключение гостя.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние, прочитанное сразу после принятия запроса libvirt.
   * @throws `CONFLICT`, если домен неактивен.
   */
  shutdownDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Принудительно останавливает домен.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние домена после остановки.
   * @throws `CONFLICT`, если домен неактивен.
   */
  destroyDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Перезагружает активный домен стандартным механизмом libvirt.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние домена после принятия запроса.
   * @throws `CONFLICT`, если домен неактивен.
   */
  rebootDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Закрывает соединение и native host. Метод идемпотентен.
   * @returns Promise, завершающийся после закрытия клиента.
   */
  close(): Promise<void>;
}

/** Стабильные машинно-читаемые категории ошибок адаптера. */
export type LibvirtAdapterErrorCode =
  | "INITIALIZATION_FAILED"
  | "HOST_ERROR"
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_DEFINITION"
  | "CANCELLED"
  | "TIMEOUT"
  | "CLOSED_CLIENT";

/** Ошибка адаптера с машинно-читаемым кодом в поле `code`. */
export class LibvirtAdapterError extends Error {
  /** Стабильная категория ошибки, пригодная для ветвления в приложении. */
  readonly code: LibvirtAdapterErrorCode;

  /**
   * @param code Стабильная категория ошибки.
   * @param message Диагностическое сообщение.
   * @param options Стандартный `ErrorOptions`, например исходная причина ошибки.
   */
  constructor(code: LibvirtAdapterErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LibvirtAdapterError";
    this.code = code;
  }
}

/**
 * Загружает WASM-контракт, запускает native host и открывает соединение libvirt.
 * @param options URI и default timeout нового клиента.
 * @returns Готовый к операциям клиент.
 * @throws `INITIALIZATION_FAILED`, если для текущей платформы нет host-пакета,
 * не удалось запустить host или открыть URI.
 */
export async function createLibvirtClient(
  options: CreateLibvirtClientOptions = {},
): Promise<LibvirtClient> {
  const uri = normalizeUri(options.uri ?? "qemu:///system");
  const defaultTimeoutMs = validateTimeout(options.defaultTimeoutMs);
  await loadWasmContract();
  const hostPath = await resolveNativeHostPath();

  return HostClient.start(uri, defaultTimeoutMs, hostPath);
}

class HostClient implements LibvirtClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #defaultTimeoutMs: number | undefined;
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
    defaultTimeoutMs: number | undefined,
  ) {
    this.#child = child;
    this.#lines = lines;
    this.#defaultTimeoutMs = defaultTimeoutMs;

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

  static async start(
    uri: string,
    defaultTimeoutMs: number | undefined,
    hostPath: string,
  ): Promise<HostClient> {
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
      return new HostClient(child, lines, defaultTimeoutMs);
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

  async health(options?: OperationOptions): Promise<LibvirtHealth> {
    return (await this.#request("health", undefined, options)) as LibvirtHealth;
  }

  async listDomains(options?: OperationOptions): Promise<DomainSummary[]> {
    return (await this.#request("list-domains", undefined, options)) as DomainSummary[];
  }

  async getDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("get-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("get-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async getDomainXml(selector: DomainSelector, options?: OperationOptions): Promise<string> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("get-domain-xml-by-uuid", validated.value, options)) as string;
    }

    return (await this.#request("get-domain-xml-by-name", validated.value, options)) as string;
  }

  async defineDomain(xml: string, options?: OperationOptions): Promise<DomainSummary> {
    if (xml.includes("\0")) {
      throw new LibvirtAdapterError(
        "INVALID_ARGUMENT",
        "domain XML must not contain NUL bytes",
      );
    }

    const encodedXml = Buffer.from(xml, "utf8").toString("hex");
    return (await this.#request("define-domain", encodedXml, options)) as DomainSummary;
  }

  async undefineDomain(selector: DomainSelector, options?: OperationOptions): Promise<void> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      await this.#request("undefine-domain-by-uuid", validated.value, options);
      return;
    }

    await this.#request("undefine-domain-by-name", validated.value, options);
  }

  async startDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("start-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("start-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async shutdownDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("shutdown-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("shutdown-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async destroyDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("destroy-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("destroy-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async rebootDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("reboot-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("reboot-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    await this.#request("close", undefined, undefined, false);
    this.#closed = true;
    this.#lines.close();
  }

  #request(
    operation: string,
    argument?: string,
    options: OperationOptions = {},
    useDefaultTimeout = true,
  ): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(
        new LibvirtAdapterError("CLOSED_CLIENT", "libvirt client is closed"),
      );
    }

    if (options.signal?.aborted) {
      return Promise.reject(
        new LibvirtAdapterError("CANCELLED", `libvirt operation ${operation} was cancelled`),
      );
    }

    const timeoutMs = validateTimeout(
      options.timeoutMs ?? (useDefaultTimeout ? this.#defaultTimeoutMs : undefined),
    );
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        if (!this.#pending.delete(id)) return;
        cleanup();
        reject(
          new LibvirtAdapterError(
            "CANCELLED",
            `libvirt operation ${operation} was cancelled`,
          ),
        );
      };
      const onTimeout = () => {
        if (!this.#pending.delete(id)) return;
        cleanup();
        reject(
          new LibvirtAdapterError(
            "TIMEOUT",
            `libvirt operation ${operation} timed out after ${timeoutMs} ms`,
          ),
        );
      };
      const cleanup = () => {
        options.signal?.removeEventListener("abort", onAbort);
        if (timeout !== undefined) clearTimeout(timeout);
      };
      const resolvePending = (value: unknown) => {
        cleanup();
        resolve(value);
      };
      const rejectPending = (error: Error) => {
        cleanup();
        reject(error);
      };

      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.#pending.set(id, { resolve: resolvePending, reject: rejectPending });
      if (timeoutMs !== undefined) timeout = setTimeout(onTimeout, timeoutMs);
      const request = argument === undefined
        ? `${id}\t${operation}\n`
        : `${id}\t${operation}\t${argument}\n`;
      this.#child.stdin.write(request, (error) => {
        if (!error) return;
        if (!this.#pending.delete(id)) return;
        rejectPending(new LibvirtAdapterError("HOST_ERROR", error.message, { cause: error }));
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

const HOST_PACKAGES: Readonly<Record<string, string>> = {
  "darwin-arm64": "ts-wasm-libvirt-host-darwin-arm64",
  "linux-arm64": "ts-wasm-libvirt-host-linux-arm64",
  "linux-x64": "ts-wasm-libvirt-host-linux-x64",
};

/**
 * Находит установленный optional dependency с host для текущей платформы.
 * Платформенные пакеты намеренно скрыты от публичного API адаптера.
 */
async function resolveNativeHostPath(): Promise<string> {
  const platform = `${process.platform}-${process.arch}`;
  const packageName = HOST_PACKAGES[platform];
  if (packageName === undefined) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      `unsupported native host platform: ${platform}`,
    );
  }

  try {
    const runtime = await import(packageName) as { nativeHostPath?: unknown };
    if (typeof runtime.nativeHostPath !== "string" || runtime.nativeHostPath.length === 0) {
      throw new Error("native host package does not export nativeHostPath");
    }
    return runtime.nativeHostPath;
  } catch (error) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      `native host package ${packageName} is unavailable for ${platform}; reinstall ts-wasm-libvirt`,
      { cause: error },
    );
  }
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

function validateDomainSelector(
  selector: DomainSelector,
): { kind: "name" | "uuid"; value: string } {
  if (typeof selector !== "object" || selector === null) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "domain selector must be an object");
  }

  const hasName = Object.prototype.hasOwnProperty.call(selector, "name");
  const hasUuid = Object.prototype.hasOwnProperty.call(selector, "uuid");
  if (hasName === hasUuid) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "domain selector must contain exactly one of name or uuid",
    );
  }

  const kind = hasUuid ? "uuid" : "name";
  const value = (selector as unknown as Record<string, unknown>)[kind];
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    /[\0\t\r\n]/.test(value)
  ) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `domain ${kind} must be a non-empty single-line string`,
    );
  }

  return { kind, value };
}

function validateTimeout(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined) return undefined;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "operation timeoutMs must be a positive finite number",
    );
  }
  return timeoutMs;
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
