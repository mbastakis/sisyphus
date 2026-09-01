import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Sisyphus",
        short_name: "Sisyphus",
        description: "Kanban for Taskwarrior",
        display: "standalone",
        background_color: "#0d0d10",
        theme_color: "#0d0d10",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The SW precaches the app shell only. /api requests are never
        // intercepted or cached: the app layer keeps its own last-projection
        // cache with an explicit staleness timestamp, so the SW can never
        // present stale task data as fresh.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8422",
        changeOrigin: true,
      },
    },
  },
});
