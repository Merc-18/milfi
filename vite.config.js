import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import process from 'node:process'

// Short commit shown in Acceso, to check which version a browser is running.
function appVersion() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'local' }
}

export default defineConfig({
  define: { 'import.meta.env.VITE_MILFI_VERSION': JSON.stringify(appVersion()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/main.jsx so a new version reloads the page once it is active.
      injectRegister: false,
      workbox: { cleanupOutdatedCaches: true, clientsClaim: true, skipWaiting: true },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'MilFi - Finanzas M&F',
        short_name: 'MilFi',
        description: 'App de finanzas para Milton y Fiorella',
        theme_color: '#FDFAF7',
        background_color: '#FDFAF7',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
