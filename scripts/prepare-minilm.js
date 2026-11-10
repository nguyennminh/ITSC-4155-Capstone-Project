import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { MODEL, REVISION, modelDirectory, modelFiles } from '../server/services/embeddingModel.js';

// Download files only. Do not initialize ONNX or consume inference memory during builds.
await mkdir(modelDirectory, { recursive: true });
const manifestPath = join(modelDirectory, 'jobswipe-model.json');
await rm(manifestPath, { force: true });
try {
  for (const file of modelFiles) {
    const response = await fetch(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`, {
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok || !response.body) throw new Error(`Model download failed: ${file} HTTP ${response.status}`);
    const destination = join(modelDirectory, file);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(`${destination}.partial`));
      await rename(`${destination}.partial`, destination);
    } finally { await rm(`${destination}.partial`, { force: true }); }
    if (file.endsWith('.json')) JSON.parse(await readFile(destination, 'utf8'));
    console.log(`Prepared ${file}`);
  }
  await writeFile(manifestPath, JSON.stringify({ model: MODEL, revision: REVISION, dtype: 'q8' }));
  console.log('MiniLM files prepared. Runtime model downloads are disabled.');
} catch (error) {
  // A failed build cannot silently deploy with missing model artifacts.
  console.error(error.message);
  process.exitCode = 1;
}
