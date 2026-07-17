import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { currentHostPackage } from "./platform.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const hostPackage = currentHostPackage();
const publishArguments = process.argv.slice(2);

if (publishArguments.some((argument) => argument !== "--dry-run")) {
  throw new Error("only --dry-run may be passed to publish-native.mjs");
}

execFileSync(
  "npm",
  ["publish", `./packages/${hostPackage.directory}`, "--access", "public", ...publishArguments],
  { cwd: workspaceRoot, stdio: "inherit" },
);
