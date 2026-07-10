import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // NB_API_PROXY lets a second dev instance point at an API on another port.
      "/api": process.env.NB_API_PROXY ?? "http://127.0.0.1:3001"
    }
  }
});
