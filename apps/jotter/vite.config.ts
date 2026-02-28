import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@capture/editor": path.resolve(__dirname, "../../packages/capture-editor/src"),
    },
  },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Jotter",
        short_name: "Jotter",
        description: "Quick notepad for brain dumps",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\.(xml|txt|json|webmanifest)$/, /^\/icons\//],
      },
    }),
  ],
});
