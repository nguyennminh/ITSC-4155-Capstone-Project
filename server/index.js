import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectMongoStore, openStore } from './store.js';

if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required in production; refusing to start with local-only storage.');
}

const store = process.env.MONGODB_URI ? await connectMongoStore() : openStore();
const app = createApp({ store });
const distDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const indexFile = resolve(distDirectory, 'index.html');
if (existsSync(indexFile)) {
  app.use(express.static(distDirectory));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(indexFile));
}

const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`JobSwipe ready on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async error => {
      if (error) {
        console.error('Failed to close the HTTP server cleanly.', error);
        process.exitCode = 1;
      }
      try { await store.close(); }
      catch (closeError) {
        console.error('Failed to close the database connection cleanly.', closeError);
        process.exitCode = 1;
      }
    });
  });
}
