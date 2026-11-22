import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
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
  const envName = process.env.PROFILE_NAME?.trim();
  if (envName) {
    return envName;
  }
  const personalJsonRaw = process.env.PERSONAL_JSON?.trim();
  if (personalJsonRaw) {
    try {
      const parsed = JSON.parse(personalJsonRaw);
      if (typeof parsed?.name === 'string' && parsed.name.trim()) {
        return parsed.name.trim();
      }
    } catch {
      // Ignore malformed PERSONAL_JSON
    }
  }
  const candidates = [
    path.resolve(__dirname, 'config/personal.json'),
    path.resolve(__dirname, 'config/personal.json.example'),
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
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
    plugins: [
      react(),
      tailwindcss(),
      dispoLiveApiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'DispoLive - Disponibilité en Temps Réel',
          short_name: 'DispoLive',
          description: 'Statut de disponibilité en direct et badges dynamiques pour signatures e-mail.',
          theme_color: '#4f46e5',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
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
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/badge(\.(png|svg|json))?$/i],
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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
