import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  root: ".",
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
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
        description: "Your quick notepad. Offline. Private. Yours. Write in markdown, attach files, sync via Google Drive.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        display_override: ["standalone", "window-controls-overlay"],
        orientation: "any",
        start_url: "/",
        id: "/",
        dir: "ltr",
        lang: "en",
        categories: ["productivity", "utilities"],
        prefer_related_applications: false,
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          { src: "/og-image.png", sizes: "1200x630", type: "image/png", label: "Jotter notepad with markdown editor" },
        ],
        shortcuts: [
          {
            name: "New Note",
            short_name: "New",
            url: "/",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
        ],
        note_taking: {
          new_note_url: "/",
        },
        launch_handler: {
          client_mode: "focus-existing",
        },
      } as any,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\.(xml|txt|json|webmanifest|html)$/, /^\/icons\//, /^\/(privacy|terms)/],
      },
    }),
  ],
});
