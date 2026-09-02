/**
 * Vite Configuration - Localiza+ IFPR Campus Ivaiporã
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'],
      manifest: {
        id: '/',
        name: 'Localiza+ IFPR Campus Ivaiporã',
        short_name: 'Localiza+ IFPR',
        description: 'Sistema Inteligente de Achados e Perdidos com IA do IFPR Campus Ivaiporã',
        theme_color: '#00843D',
        background_color: '#0a0a0a',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'window-controls-overlay'],
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['utilities', 'productivity', 'education'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Itens Perdidos',
            short_name: 'Perdidos',
            description: 'Ver lista de itens perdidos no campus',
            url: '/perdidos',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Itens Encontrados',
            short_name: 'Encontrados',
            description: 'Ver itens encontrados aguardando devolução',
            url: '/encontrados',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Cadastrar Objeto',
            short_name: 'Cadastrar',
            description: 'Cadastrar um novo item perdido ou encontrado',
            url: '/cadastrar',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Buscar no Campus',
            short_name: 'Buscar',
            description: 'Buscar objetos perdidos ou achados no IFPR',
            url: '/buscar',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Painel Administrativo',
            short_name: 'Admin',
            description: 'Acesso ao painel administrativo institucional',
            url: '/admin',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
        ],
        prefer_related_applications: false,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/__/],
        importScripts: ['/sw-custom.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unsplash-images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            if (
              id.includes('jspdf') ||
              id.includes('jspdf-autotable') ||
              id.includes('html2canvas') ||
              id.includes('canvg') ||
              id.includes('dompurify') ||
              id.includes('fflate')
            ) {
              return 'vendor-export';
            }
            if (id.includes('recharts') || id.includes('d3') || id.includes('victory-vendor')) {
              return 'vendor-charts';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('motion')) {
              return 'vendor-motion';
            }
          }
          return undefined;
        },
      },
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR === 'true' ? false : true,
  },
});
