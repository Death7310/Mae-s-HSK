import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps every URL relative so the same build works on a web host
// sub-path (GitHub Pages), inside a Capacitor Android APK, and from a USB stick
// served by any static file server.
// NATIVE=1 builds the bundle that ships inside the Android app: every asset is
// already on the device there, so no service worker is generated.
const native = process.env.NATIVE === '1';

export default defineConfig({
  base: './',
  define: { __NATIVE__: JSON.stringify(native) },
  plugins: [
    preact(),
    VitePWA({
      disable: native,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: "Mae's HSK — چینی برای فارسی‌زبانان",
        short_name: "Mae's HSK",
        description: 'آموزش آفلاین واژگان و مکالمهٔ چینی (HSK ۱ تا ۶) برای فارسی‌زبانان',
        lang: 'fa',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        background_color: '#fbf7f2',
        theme_color: '#a4262c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + all JSON data are precached so the app is fully usable
        // offline after the first load. Audio is cached per level on demand
        // (see src/lib/offline.ts) because it is large.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        globIgnores: ['**/audio/**'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-v1',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 40000 },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
});
