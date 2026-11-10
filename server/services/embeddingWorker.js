import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MODEL, REVISION, modelDirectory, validVector } from './embeddingModel.js';

try {
  const manifest = JSON.parse(await readFile(join(modelDirectory, 'jobswipe-model.json'), 'utf8'));
  if (manifest.model !== MODEL || manifest.revision !== REVISION || manifest.dtype !== 'q8') throw new Error('Model artifact mismatch');
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  const model = await pipeline('feature-extraction', modelDirectory, {
    dtype: 'q8', local_files_only: true,
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  });
  const encode = async text => {
    const vector = Array.from((await model(text, { pooling: 'mean', normalize: true })).data);
    if (!validVector(vector)) throw new Error('Invalid embedding');
    return vector;
  };
  await encode('JobSwipe model warm-up.');
  parentPort.postMessage({ type: 'ready' });
  // Serialize inference, including across concurrent HTTP requests.
  let queue = Promise.resolve();
  parentPort.on('message', ({ id, text }) => {
    queue = queue.then(async () => {
      try { parentPort.postMessage({ id, vector: await encode(text) }); }
      catch { parentPort.postMessage({ id, error: true }); }
    });
  });
} catch {
  parentPort.postMessage({ type: 'unavailable' });
  parentPort.close();
}
