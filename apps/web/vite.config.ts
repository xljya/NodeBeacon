import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Production assets live below the Komari-derived public shell. Keeping the
  // legacy application on its own asset prefix lets Fastify route /admin,
  // /login and /nodes to this bundle without asset-name collisions.
  base: process.env.NB_WEB_BASE ?? "/legacy/",
  plugins: [react()],
  server: {
    proxy: {
      // NB_API_PROXY lets a second dev instance point at an API on another port.
      "/api": process.env.NB_API_PROXY ?? "http://127.0.0.1:3001"
    }
  }
});
