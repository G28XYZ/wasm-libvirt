import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentHostPackage, hostPackages } from "./platform.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDirectory = fileURLToPath(
  new URL("../packages/libvirt-adapter/", import.meta.url),
);
const npmCacheDirectory = join(tmpdir(), "wasm-libvirt-npm-cache");
const packageJson = JSON.parse(
  await readFile(new URL("../packages/libvirt-adapter/package.json", import.meta.url), "utf8"),
);
const nativePackage = currentHostPackage();
const nativePackageDirectory = fileURLToPath(
  new URL(`../packages/${nativePackage.directory}/`, import.meta.url),
);

assertPublishableVersion(packageJson.version);
await assertPlatformPackageVersions(packageJson);
run("npm", ["run", "check"], workspaceRoot);

const packagedFiles = packFiles(packageDirectory);
for (const requiredFile of [
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "package.json",
  "wasm/wasm_core_bg.wasm",
]) {
  if (!packagedFiles.has(requiredFile)) {
    throw new Error(`release tarball is missing ${requiredFile}`);
  }
}
if ([...packagedFiles].some((file) => file.startsWith("native/"))) {
  throw new Error("main package must not contain a native host executable");
}

const nativePackagedFiles = packFiles(nativePackageDirectory);
for (const requiredFile of ["index.d.ts", "index.js", "package.json", "wasm-libvirt-host"]) {
  if (!nativePackagedFiles.has(requiredFile)) {
    throw new Error(`${nativePackage.name} tarball is missing ${requiredFile}`);
  }
}

async function assertPlatformPackageVersions(corePackage) {
  for (const hostPackage of hostPackages) {
    const hostManifest = JSON.parse(
      await readFile(
        new URL(`../packages/${hostPackage.directory}/package.json`, import.meta.url),
        "utf8",
      ),
    );
    if (hostManifest.name !== hostPackage.name) {
      throw new Error(`unexpected package name in packages/${hostPackage.directory}`);
    }
    if (
      hostManifest.os?.length !== 1 ||
      hostManifest.os[0] !== hostPackage.platform ||
      hostManifest.cpu?.length !== 1 ||
      hostManifest.cpu[0] !== hostPackage.architecture
    ) {
      throw new Error(`${hostPackage.name} must declare its matching os and cpu`);
    }
    if (hostManifest.version !== corePackage.version) {
      throw new Error(`${hostPackage.name} version must match wasm-libvirt`);
    }
    if (corePackage.optionalDependencies?.[hostPackage.name] !== corePackage.version) {
      throw new Error(`wasm-libvirt must pin ${hostPackage.name} to its own version`);
    }
  }
}

function packFiles(directory) {
  const packed = JSON.parse(
    runCapture(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", npmCacheDirectory],
      directory,
    ),
  );
  if (!Array.isArray(packed) || packed.length !== 1) {
    throw new Error("npm pack did not return exactly one package manifest");
  }
  return new Set(packed[0].files.map((file) => file.path));
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
