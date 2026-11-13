import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function safeHmrClientPlugin(disableHmr: boolean): Plugin {
  return {
    name: 'arxivlab-safe-hmr-client',
    apply: 'serve',
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
    plugins: [react(), tailwindcss(), safeHmrClientPlugin(disableHmr)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
