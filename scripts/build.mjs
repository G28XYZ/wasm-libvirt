import { execFileSync, spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

const root = new URL("../", import.meta.url);
const packageRoot = new URL("../packages/libvirt-adapter/", import.meta.url);
const environment = resolveCargoEnvironment();

run("rustup", [
  "run",
  "stable",
  "cargo",
  "build",
  "-p",
  "wasm-libvirt-core",
  "--target",
  "wasm32-unknown-unknown",
]);
run("rustup", ["run", "stable", "cargo", "build", "-p", "wasm-libvirt-host"]);

const wasmDirectory = new URL("wasm/", packageRoot);
const nativeDirectory = new URL("native/", packageRoot);
await mkdir(wasmDirectory, { recursive: true });
await mkdir(nativeDirectory, { recursive: true });

await copyFile(
  new URL("target/wasm32-unknown-unknown/debug/wasm_libvirt_core.wasm", root),
  new URL("wasm_core_bg.wasm", wasmDirectory),
);
await copyFile(
  new URL("target/debug/wasm-libvirt-host", root),
  new URL("wasm-libvirt-host", nativeDirectory),
);
await chmod(new URL("wasm-libvirt-host", nativeDirectory), 0o755);

run("npm", ["exec", "tsc", "--", "-p", "packages/libvirt-adapter/tsconfig.json"]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function resolveCargoEnvironment() {
  const environment = { ...process.env, CARGO_TERM_COLOR: "always" };
  if (process.platform !== "darwin") return environment;

  try {
    const prefix = execFileSync("brew", ["--prefix", "libvirt"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    environment.PKG_CONFIG_PATH = [
      join(prefix, "lib", "pkgconfig"),
      environment.PKG_CONFIG_PATH,
    ]
      .filter(Boolean)
      .join(delimiter);
  } catch {
    // The Rust linker will report an actionable missing-libvirt error.
  }

  return environment;
}
