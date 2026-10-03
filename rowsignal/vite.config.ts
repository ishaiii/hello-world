import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Dev only: server-render the public pages on the fly so `npm run dev` serves the whole site. */
function publicPagesDev(): Plugin {
  return {
    name: 'rowsignal-public-pages-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.method !== 'GET' || !req.url) return next();
          const url = new URL(req.url, 'http://localhost');
          if (url.pathname === '/app') {
            res.statusCode = 301;
            res.setHeader('Location', '/app/' + url.search);
            return res.end();
          }
          const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
          const mod = (await server.ssrLoadModule('/src/public-site/entry-server.tsx')) as typeof import('./src/public-site/entry-server');
          if (!mod.ROUTES.some((r) => r.path === path)) return next();
          const html = await mod.renderPage(path, { scripts: ['/src/public-site/entry-client.tsx'], styles: [] });
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await server.transformIndexHtml(req.url, html));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), publicPagesDev()],
  build: {
    target: 'es2022',
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: { app: 'app/index.html', public: 'src/public-site/entry-client.tsx' },
    },
  },
  ssr: { noExternal: ['lucide-react'] },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
