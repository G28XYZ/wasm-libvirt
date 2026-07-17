import { readFile, writeFile } from "node:fs/promises";
import { hostPackages } from "./platform.mjs";

const requestedVersion = process.argv[2];
if (process.argv.length !== 3 || requestedVersion === undefined) {
  throw new Error("usage: npm run version:bump -- <patch|minor|major|x.y.z>");
}

const coreManifestUrl = new URL("../packages/libvirt-adapter/package.json", import.meta.url);
const coreManifest = await readManifest(coreManifestUrl);
const previousVersion = coreManifest.version;
const nextVersion = resolveNextVersion(previousVersion, requestedVersion);

coreManifest.version = nextVersion;
for (const hostPackage of hostPackages) {
  coreManifest.optionalDependencies[hostPackage.name] = nextVersion;
}

const manifests = [{ url: coreManifestUrl, json: coreManifest }];
for (const hostPackage of hostPackages) {
  const url = new URL(`../packages/${hostPackage.directory}/package.json`, import.meta.url);
  const json = await readManifest(url);
  if (json.name !== hostPackage.name) {
    throw new Error(`unexpected package name in packages/${hostPackage.directory}`);
  }
  json.version = nextVersion;
  manifests.push({ url, json });
}

await Promise.all(
  manifests.map(({ url, json }) => writeFile(url, `${JSON.stringify(json, null, 2)}\n`)),
);

console.log(
  `updated ${manifests.length} publishable packages: ${previousVersion} -> ${nextVersion}`,
);

async function readManifest(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function resolveNextVersion(currentVersion, requested) {
  const current = parseVersion(currentVersion, "current package version");
  if (/^\d+\.\d+\.\d+$/.test(requested)) {
    parseVersion(requested, "requested version");
    return requested;
  }

  switch (requested) {
    case "major":
      return `${current.major + 1}.0.0`;
    case "minor":
      return `${current.major}.${current.minor + 1}.0`;
    case "patch":
      return `${current.major}.${current.minor}.${current.patch + 1}`;
    default:
      throw new Error("version must be patch, minor, major, or an exact x.y.z value");
  }
}

function parseVersion(version, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (match === null) {
    throw new Error(`${label} must be a stable semantic version (x.y.z)`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}
