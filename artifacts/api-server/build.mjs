import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Externalize bare npm imports so the bundle resolves them from the production
// node_modules at runtime (populated by `pnpm deploy --prod` in the Docker
// build). Workspace packages (@scout-expense-tracker/*) are BUNDLED inline so
// no TypeScript needs to execute at runtime.
const WORKSPACE = /^@scout-expense-tracker\//;
const externalBare = {
  name: "external-bare",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (
        args.path.startsWith(".") ||
        args.path.startsWith("/") ||
        args.path.startsWith("node:") ||
        WORKSPACE.test(args.path)
      ) {
        return undefined;
      }
      return { path: args.path, external: true };
    });
  },
};

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  plugins: [externalBare],
  banner: { js: "" },
};

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(__dirname, "src/index.ts")],
    outfile: path.join(__dirname, "dist/index.mjs"),
  }),
  build({
    ...common,
    entryPoints: [path.join(__dirname, "src/seed-admin.ts")],
    outfile: path.join(__dirname, "dist/seed-admin.mjs"),
  }),
]);

console.log("api-server build complete -> dist/*.mjs");
