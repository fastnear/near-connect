import { defineConfig, type PluginOption } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

const pkg = process.env.PACKAGE!;
const EXAMPLE = process.env.EXAMPLE!;

const plugins: PluginOption[] = [];
if (process.env.ANALYZE) {
  plugins.push(
    visualizer({
      filename: `../repository/${pkg}-stats.html`,
      gzipSize: true,
    }),
  );
}

export default defineConfig({
  plugins,
  root: "./",
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
