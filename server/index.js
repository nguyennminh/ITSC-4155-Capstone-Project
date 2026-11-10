import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectMongoStore } from './store.js';

if (!process.env.MONGODB_URI?.trim()) {
  console.error('MONGODB_URI is required. Configure MongoDB in .env or the hosting environment.');
  process.exit(1);
}

const startedAt = Date.now();
console.log('Connecting to MongoDB and verifying indexes.');
let store;
try {
  store = await connectMongoStore(process.env.MONGODB_URI.trim());
} catch (error) {
  // Driver errors can include connection details. Log only the error class and numeric code.
  const kind = /^[A-Za-z][A-Za-z0-9_]*$/.test(error?.name) ? error.name : 'DatabaseError';
  const code = typeof error?.code === 'number' ? `; code ${error.code}` : '';
  console.error(`MongoDB startup failed after ${Date.now() - startedAt} ms (${kind}${code}). Check MONGODB_URI, network access, and database permissions.`);
  process.exit(1);
}
console.log(`MongoDB ready in ${Date.now() - startedAt} ms.`);
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
