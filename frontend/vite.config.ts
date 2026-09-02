import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sisyphus as theme } from "@nocturne-rose/sisyphus";

export default defineConfig({
  plugins: [
    {
      name: "nocturne-rose-html",
      transformIndexHtml(html) {
        return html.replaceAll("__NOCTURNE_ROSE_CANVAS__", theme.canvas);
      },
    },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Sisyphus",
        short_name: "Sisyphus",
        description: "Kanban for Taskwarrior",
        display: "standalone",
        background_color: theme.canvas,
        theme_color: theme.canvas,
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
        // /outpost.goauthentik.io must reach the network: when the app sits
        // behind Authentik forward-auth, the login callback is a navigation
        // to that path — serving the shell instead would trap the user in a
        // login loop.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/outpost\.goauthentik\.io\//],
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
