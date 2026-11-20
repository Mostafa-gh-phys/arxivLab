import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const PWA_MANIFEST = {
  id: '/',
  name: 'arXivLab — Research Workstation',
  short_name: 'arXivLab',
  description:
    'Search arXiv & INSPIRE-HEP papers, preview PDFs, organize citations, sync Zotero and Google Drive on phone and desktop.',
  theme_color: '#0D121C',
  background_color: '#f5f5f7',
  display: 'standalone' as const,
  start_url: '/',
  scope: '/',
  orientation: 'any' as const,
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

function safeHmrClientPlugin(disableHmr: boolean): Plugin {
  return {
    name: 'arxivlab-safe-hmr-client',
    apply: 'serve',
    configureServer(server) {
      if (!disableHmr) return;
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.end(JSON.stringify(PWA_MANIFEST, null, 2));
      });
    },
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/');
      if (!normalized.endsWith('/vite/dist/client/client.mjs')) return;
      const target = 'transport.connect(createHMRHandler(handleMessage));';
      if (!code.includes(target)) return;
      if (disableHmr) {
        return code.replace(target, '/* HMR disabled: WebSocket connection skipped */');
      }
      return code.replace(
        target,
        'transport.connect(createHMRHandler(handleMessage)).catch(() => {});'
      );
    },
  };
}

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === 'true';
  return {
    plugins: [
      react(),
      tailwindcss(),
      safeHmrClientPlugin(disableHmr),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: PWA_MANIFEST,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/mcp/],
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
                cacheableResponse: { statuses: [0, 200] },
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
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: !disableHmr,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !disableHmr,
      ws: disableHmr ? (false as const) : undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: disableHmr ? null : {},
    },
  };
});
