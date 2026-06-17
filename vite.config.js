import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Build-Zeitpunkt als Versionsmarker (in der App unter Einstellungen sichtbar)
const buildTime = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

export default defineConfig({
  // Relative Pfade, damit die App auch in Unterordnern bzw. ohne Server-Root läuft
  base: "./",
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt": neue Version wird gemeldet statt still erzwungen — ermöglicht
      // den manuellen Update-Button + Hinweis-Banner in der App.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "TrainerHub TV Bretten",
        short_name: "TrainerHub",
        description: "Trainingsmanagement TV Bretten Basketball",
        lang: "de",
        theme_color: "#f97316",
        background_color: "#09090f",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Alles cachen — App läuft komplett offline
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]
      }
    })
  ]
});
