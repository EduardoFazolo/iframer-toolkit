// Bundles the CLI, MCP server, and local server with esbuild.
//
// Why esbuild and not `bun build`: bun's bundler inlines `__dirname` as an
// absolute string literal of the BUILD machine's path, which leaked
// `/Users/<me>/...` into every published bundle and made path resolution
// (daemon spawn, extension path) resolve to the build checkout instead of the
// install location. esbuild keeps `__dirname`/`__filename` as runtime values.
//
// esbuild's CJS output has no `import.meta.url`, which the source uses, so we
// shim it: define `import.meta.url` -> a runtime file:// URL derived from
// `__filename` (the real bundle path at run time). Dev still runs the .ts
// under bun/tsx as ESM, where the real `import.meta.url` is used.

import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  banner: { js: "const importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
  define: { "import.meta.url": "importMetaUrl" },
  external: [
    "better-sqlite3",
    "bun:sqlite",
    "patchright",
    "fingerprint-generator",
    "@anthropic-ai/sdk",
    "@modelcontextprotocol/sdk",
    "zod",
    "cloakbrowser",
    "playwright-core",
  ],
};

const targets = [
  { entryPoints: ["bin/cli.js"], outfile: "dist/cli.js" },
  { entryPoints: ["src/mcp/server.ts"], outfile: "dist/mcp-server.cjs" },
  {
    entryPoints: ["index.ts"],
    outfile: "dist/local-server.cjs",
    external: [...shared.external, "express", "ws"],
  },
];

for (const t of targets) {
  await build({ ...shared, ...t });
  console.log(`built ${t.outfile}`);
}
