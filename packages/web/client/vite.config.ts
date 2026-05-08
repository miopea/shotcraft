import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "../dist/client"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3002",
    },
  },
});
