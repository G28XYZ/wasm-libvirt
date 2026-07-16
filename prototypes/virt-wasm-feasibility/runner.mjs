import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";

import { initialState, reduce } from "./state.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cargoEnvironment = resolveCargoEnvironment();
let state = initialState();

const checks = {
  wasmCore: {
    command: "rustup",
    args: ["run", "stable", "cargo", "build", "-p", "prototype-wasm-core", "--target", "wasm32-unknown-unknown"],
    success: "portable Rust core compiled to wasm32-unknown-unknown",
  },
  directVirt: {
    command: "rustup",
    args: ["run", "stable", "cargo", "build", "-p", "prototype-direct-virt", "--target", "wasm32-unknown-unknown"],
    success: "virt unexpectedly compiled into the WASM target",
  },
  nativeHost: {
    command: "rustup",
    args: ["run", "stable", "cargo", "run", "-p", "prototype-native-host"],
    success: "native virt host opened and closed test:///default",
  },
};

function render(clear = true) {
  if (clear && process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");

  console.log("\x1b[1mPROTOTYPE — virt + WASM feasibility\x1b[0m");
  console.log(`\x1b[2m${state.question}\x1b[0m\n`);

  for (const [name, result] of Object.entries(state.checks)) {
    console.log(`\x1b[1m${name}\x1b[0m`);
    console.log(`  status:  ${result.status}`);
    console.log(`  summary: ${result.summary || "—"}`);
  }

  console.log("\n\x1b[1mVerdict\x1b[0m");
  console.log(`  ${state.verdict}`);
  console.log("\n\x1b[1m[w]\x1b[0m wasm core  \x1b[1m[d]\x1b[0m direct virt  \x1b[1m[n]\x1b[0m native host  \x1b[1m[a]\x1b[0m all  \x1b[1m[q]\x1b[0m quit");
}

async function runCheck(name) {
  const check = checks[name];
  const result = await run(check.command, check.args);
  const directVirtExpectedFailure = name === "directVirt" && result.code !== 0;

  let status = result.code === 0 ? "passed" : "failed";
  let summary = result.code === 0 ? check.success : summarizeFailure(result.output);

  if (directVirtExpectedFailure) {
    summary = `expected portability failure: ${summary}`;
  }

  state = reduce(state, {
    type: "check-finished",
    check: name,
    status,
    summary,
  });
  render();
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: cargoEnvironment,
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => resolve({ code: 1, output: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function resolveCargoEnvironment() {
  const environment = { ...process.env, CARGO_TERM_COLOR: "never" };

  if (process.platform !== "darwin") return environment;

  try {
    const prefix = execFileSync("brew", ["--prefix", "libvirt"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pkgConfigPath = join(prefix, "lib", "pkgconfig");
    environment.PKG_CONFIG_PATH = [pkgConfigPath, environment.PKG_CONFIG_PATH]
      .filter(Boolean)
      .join(delimiter);
  } catch {
    // The native check will surface the missing system dependency.
  }

  return environment;
}

function summarizeFailure(output) {
  const useful = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /error|failed|libvirt|pkg-config|not found/i.test(line));

  return (useful.at(-1) || "command failed").slice(0, 240);
}

async function runAll() {
  for (const name of ["wasmCore", "directVirt", "nativeHost"]) {
    await runCheck(name);
  }
}

async function interactive() {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  render();

  while (true) {
    const answer = (await readline.question("\ncheck> ")).trim().toLowerCase();
    if (answer === "q") break;
    if (answer === "a") await runAll();
    if (answer === "w") await runCheck("wasmCore");
    if (answer === "d") await runCheck("directVirt");
    if (answer === "n") await runCheck("nativeHost");
  }

  readline.close();
}

if (process.argv.includes("--all")) {
  render(false);
  await runAll();
} else {
  await interactive();
}
