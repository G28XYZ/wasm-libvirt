import process from "node:process";

export const hostPackages = Object.freeze([
  Object.freeze({
    directory: "host-darwin-arm64",
    name: "wasm-libvirt-host-darwin-arm64",
    platform: "darwin",
    architecture: "arm64",
  }),
  Object.freeze({
    directory: "host-linux-arm64",
    name: "wasm-libvirt-host-linux-arm64",
    platform: "linux",
    architecture: "arm64",
  }),
  Object.freeze({
    directory: "host-linux-x64",
    name: "wasm-libvirt-host-linux-x64",
    platform: "linux",
    architecture: "x64",
  }),
]);

export function currentHostPackage() {
  const hostPackage = hostPackages.find(
    ({ platform, architecture }) =>
      platform === process.platform && architecture === process.arch,
  );

  if (hostPackage === undefined) {
    throw new Error(`unsupported native host platform: ${process.platform}-${process.arch}`);
  }

  return hostPackage;
}
