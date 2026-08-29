// Stamp the package version into extension/manifest.json so the shipped
// extension's version always equals the npm package version. This is what makes
// the "npm as update channel" check meaningful: the extension can compare its
// own manifest version to the version the (freshly-updated) server reports.
//
// Preserves everything else in the manifest (notably the pinned `key`, which
// keeps the extension ID — and thus native-host pairing — stable across
// updates). Runs first in `bun run build`.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifestPath = path.join(root, "extension", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`stamped extension manifest version -> ${pkg.version}`);
} else {
  console.log(`extension manifest version already ${pkg.version}`);
}
