import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

const pkg = process.env.PACKAGE!;
const EXAMPLE = process.env.EXAMPLE!;

// Replace the npm `borsh` package with the lean `@fastnear/borsh` at build time.
// This drops ~28 KB of unused borsh code (set, map, bool, signed ints, f32/f64,
// schema validation, runtime type checking) from executor bundles.
const FASTNEAR_BORSH = path.resolve(
  __dirname,
  "../../../fastnear-js-monorepo/packages/borsh/dist/esm/index.js",
);

export default defineConfig({
  plugins: [
    process.env.ANALYZE && visualizer({
      filename: `../repository/${pkg}-stats.html`,
      gzipSize: true,
    }),
  ].filter(Boolean),
  root: "./",
  resolve: {
    alias: {
      borsh: FASTNEAR_BORSH,
    },
  },
  build: {
    sourcemap: false,
    emptyOutDir: false,
    outDir: EXAMPLE ? "../example/public/repository" : "../repository",
    rollupOptions: {
      input: {
        main: `./src/${pkg}`,
      },
      output: {
        entryFileNames: `${pkg}.js`,
        assetFileNames: `${pkg}.js`,
        format: "iife",
      },
    },
  },
});
