import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "SurSadhana AI",
        short_name: "SurSadhana",
        description: "Harmonium-guided vocal pitch trainer for sargam riyaz.",
        theme_color: "#12372f",
        background_color: "#f5f1e8",
        display: "standalone",
        start_url: "/harmonium",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // The API is never cached; offline mode serves the app shell only.
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"]
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
