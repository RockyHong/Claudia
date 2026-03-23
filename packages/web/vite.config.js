import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      "/event": "http://localhost:7890",
      "/events": "http://localhost:7890",
      "/api": "http://localhost:7890",
      "/focus": "http://localhost:7890",
      "/avatar": "http://localhost:7890",
    },
  },
  build: {
    outDir: "dist",
  },
});
