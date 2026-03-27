import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      "/event": "http://localhost:48901",
      "/events": "http://localhost:48901",
      "/api": "http://localhost:48901",
      "/focus": "http://localhost:48901",
      "/avatar": "http://localhost:48901",
      "/sfx": "http://localhost:48901",
      "/hook": "http://localhost:48901",
    },
  },
  build: {
    outDir: "dist",
  },
});
