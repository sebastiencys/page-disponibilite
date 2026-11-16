import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';
import {handleApiRequest} from './src/server/routes.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readPersonalName(): string {
  const candidates = [
    path.resolve(__dirname, 'config/personal.json'),
    path.resolve(__dirname, 'config/personal.example.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed?.name === 'string' && parsed.name.trim()) {
          return parsed.name.trim();
        }
      }
    } catch {
      // Ignore invalid/unreadable config and fall back to next candidate
    }
  }
  return '';
}

function dispoLiveApiPlugin() {
  return {
    name: 'dispolive-api',
    transformIndexHtml(html: string) {
      const personalName = readPersonalName();
      if (!personalName) return html;
      const escapedTitle = escapeHtml(`${personalName} — Disponibilité en direct | DispoLive`);
      return html
        .replace(
          /<title>[^<]*<\/title>/i,
          `<title>${escapedTitle}</title>`,
        )
        .replace(
          /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
          `<meta property="og:title" content="${escapedTitle}" />`,
        );
    },
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        try {
          const handled = await handleApiRequest(req, res);
          if (!handled) next();
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), dispoLiveApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
