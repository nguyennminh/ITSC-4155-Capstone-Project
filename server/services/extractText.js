import path from 'node:path';
import { Worker } from 'node:worker_threads';

export function validateResume(file) {
  if (!file?.buffer?.length) throw new Error('Select a nonempty resume.');
  if (file.buffer.length > 10 * 1024 * 1024) throw new Error('Resume must be 10 MB or smaller.');
  const extension = path.extname(file.originalname).toLowerCase();
  const pdf = file.buffer.subarray(0, 5).toString() === '%PDF-';
  const zip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!((extension === '.pdf' && pdf) || (extension === '.docx' && zip))) {
    throw new Error('File contents must match a PDF or DOCX extension.');
  }
  return extension;
}

export function extractText(file) {
  const extension = validateResume(file);
  // Keep expensive/untrusted document parsing off the web server's main thread.
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extractWorker.js', import.meta.url), {
      workerData: { buffer: file.buffer, extension },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let done = false;
    const finish = (error, text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(new Error(error));
      else resolve(text);
    };
    const timer = setTimeout(() => finish('Parsing took too long. Try a simpler document.'), 20000);
    worker.once('message', result => finish(result.error, result.text));
    worker.once('error', () => finish('Could not process this document. Try another file.'));
    worker.once('exit', () => { if (!done) finish('Document processing stopped. Try another file.'); });
  });
}
