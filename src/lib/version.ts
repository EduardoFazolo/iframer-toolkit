import fs from "fs";
import path from "path";

let cached: string | null = null;

/** The iframer package version. Read from package.json at runtime so it works
 *  from both dev (source) and the bundled dist. The extension compares this
 *  (reported by the server) to its own manifest version to know when an
 *  `npm update` has landed newer files on disk that it should reload into. */
export function getVersion(): string {
  if (cached) return cached;
  if (process.env.IFRAMER_VERSION) return (cached = process.env.IFRAMER_VERSION);
  const candidates = [
    path.join(__dirname, "..", "..", "package.json"), // src/lib -> root (dev)
    path.join(__dirname, "..", "package.json"), // dist -> root (bundled)
    path.join(process.cwd(), "package.json"),
  ];
  for (const p of candidates) {
    try {
      const v = JSON.parse(fs.readFileSync(p, "utf8")).version;
      if (v) return (cached = v);
    } catch {
      /* try next */
    }
  }
  return (cached = "0.0.0");
}
