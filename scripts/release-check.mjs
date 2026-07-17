import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDirectory = fileURLToPath(
  new URL("../packages/libvirt-adapter/", import.meta.url),
);
const packageJson = JSON.parse(
  await readFile(new URL("../packages/libvirt-adapter/package.json", import.meta.url), "utf8"),
);

assertPublishableVersion(packageJson.version);
run("npm", ["run", "check"], workspaceRoot);

const packed = JSON.parse(
  runCapture("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], packageDirectory),
);
if (!Array.isArray(packed) || packed.length !== 1) {
  throw new Error("npm pack did not return exactly one package manifest");
}

const packagedFiles = new Set(packed[0].files.map((file) => file.path));
for (const requiredFile of [
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "native/wasm-libvirt-host",
  "package.json",
  "wasm/wasm_core_bg.wasm",
]) {
  if (!packagedFiles.has(requiredFile)) {
    throw new Error(`release tarball is missing ${requiredFile}`);
  }
}

function assertPublishableVersion(version) {
  if (version === "0.0.0") {
    throw new Error("set a release version with npm version before publishing");
  }

  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`package version is not valid semver: ${version}`);
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function runCapture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}
