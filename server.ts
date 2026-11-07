import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest } from './src/server/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// API routes middleware
app.use(async (req, res, next) => {
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) next();
  } catch (err) {
    next(err);
  }
});

// Static assets from Vite dist
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DispoLive server listening on port ${PORT}`);
});
