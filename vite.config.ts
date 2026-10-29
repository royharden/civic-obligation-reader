import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-server port: claim one through the agent-ports registry before `npm run dev`
// (PJ-OD skills-bts/agent-ports) and pass it with `npm run dev -- --port <port>`.
// Only VITE_-prefixed variables reach the browser bundle; eval-only keys never use that prefix.
export default defineConfig({
  plugins: [react()],
  envPrefix: "VITE_",
  server: {
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
});
