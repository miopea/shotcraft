import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "config/index": "src/config/index.ts",
    "cli/index": "src/cli/index.ts",
    "render/index": "src/render/index.ts",
    "template/index": "src/template/index.ts",
    "capture/index": "src/capture/index.ts",
    "auth/index": "src/auth/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "node20",
});
