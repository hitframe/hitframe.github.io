import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// base relativa: funziona su GitHub Pages, in una sottocartella o in locale
// --mode desktop: build per l'app Mac/Windows (Tauri), senza service worker
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    mode !== 'desktop' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Hitframe',
        short_name: 'Hitframe',
        description: 'Allenamento, gare e preparazione per il tiro dinamico IPSC',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B0B0C',
        theme_color: '#0B0B0C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // GDA Split è una pagina a sé (public/split): non va sostituita con l'app
        navigateFallbackDenylist: [/\/split\//],
      },
    }),
  ],
}))
