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
        description: "Trainingsbuch, Anwesenheit und Saisonplanung für TV Bretten Basketball",
        lang: "de",
        // Neutral wie der App-Hintergrund (Light); zur Laufzeit setzt die App
        // <meta name="theme-color"> passend zum gewählten Theme.
        theme_color: "#fafaf9",
        background_color: "#fafaf9",
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
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Servermodus (Phase 3): API und PocketBase-Admin nie aus dem App-Cache beantworten.
        // API-Aufrufe selbst sind fetch()-Requests und werden nicht gecacht (kein runtimeCaching).
        navigateFallbackDenylist: [/^\/api\//, /^\/_\//]
      }
    })
  ]
});
