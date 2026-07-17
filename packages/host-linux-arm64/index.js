import { fileURLToPath } from "node:url";

/** Absolute path to the native host executable packaged for this platform. */
export const nativeHostPath = fileURLToPath(new URL("./wasm-libvirt-host", import.meta.url));
