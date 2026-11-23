import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// OCR offline (lettura degli screenshot dei risultati): i file di Tesseract vengono serviti dall'app, mai da una CDN
const OCR: Record<string, string> = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-simd-lstm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.js',
  'tesseract-core-simd-lstm.wasm': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm',
  'tesseract-core-lstm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.js',
  'tesseract-core-lstm.wasm': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm',
  'eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
}
function fileOcr(): Plugin {
  return {
    name: 'hitframe-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/ocr\/([^?]+)/)
        const src = m && OCR[m[1]]
        if (!src) return next()
        res.setHeader('Content-Type', m[1].endsWith('.wasm') ? 'application/wasm' : m[1].endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        fs.createReadStream(path.resolve(src)).pipe(res)
      })
    },
    generateBundle() {
      for (const [nome, src] of Object.entries(OCR)) this.emitFile({ type: 'asset', fileName: `ocr/${nome}`, source: fs.readFileSync(path.resolve(src)) })
    },
  }
}

// base relativa: funziona su GitHub Pages, in una sottocartella o in locale
// --mode desktop: build per l'app Mac/Windows (Tauri), senza service worker
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    fileOcr(),
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
        // il motore OCR è grande: si scarica al primo uso e poi resta in cache (anche offline)
        globIgnores: ['ocr/**'],
        runtimeCaching: [{ urlPattern: /\/ocr\//, handler: 'CacheFirst', options: { cacheName: 'hitframe-ocr', expiration: { maxEntries: 12 } } }],
      },
    }),
  ],
}))
