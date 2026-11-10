import { Worker } from 'node:worker_threads';

export function createEmbeddingClient({ workerFactory = () => new Worker(new URL('./embeddingWorker.js', import.meta.url)),
  startupTimeoutMs = 60000, inferenceTimeoutMs = 10000, log = console.info } = {}) {
  let worker, state = 'idle', sequence = 0, startup, settleStartup, readiness;
  const pending = new Map();
  const status = () => state;
  function stop(nextState) {
    state = nextState;
    clearTimeout(startup);
    settleStartup?.(false);
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Embedding worker unavailable')); }
    pending.clear();
    const current = worker;
    worker = undefined;
    return current?.terminate();
  }
  function start() {
    if (state !== 'idle') return state === 'loading' ? readiness : Promise.resolve(state === 'ready');
    state = 'loading';
    const started = Date.now();
    readiness = new Promise(resolve => { settleStartup = resolve; });
    try {
      worker = workerFactory();
      worker.on('message', message => {
        if (message.type === 'ready' && state === 'loading') {
          state = 'ready'; clearTimeout(startup); settleStartup(true);
          log(`[MiniLM] Ready in ${Date.now() - started} ms; process RSS ${Math.round(process.memoryUsage().rss / 1048576)} MiB.`);
        } else if (message.type === 'unavailable') {
          log('[MiniLM] Local model unavailable. Using keyword ranking until restart.');
          void stop('unavailable');
        } else if (pending.has(message.id)) {
          const request = pending.get(message.id);
          pending.delete(message.id); clearTimeout(request.timer);
          message.error ? request.reject(new Error('Embedding failed')) : request.resolve(message.vector);
        }
      });
      worker.on('error', () => { log('[MiniLM] Worker failed. Using keyword ranking until restart.'); void stop('unavailable'); });
      worker.on('exit', () => { if (worker) void stop('unavailable'); });
      worker.unref();
      startup = setTimeout(() => { log('[MiniLM] Warm-up timed out. Using keyword ranking until restart.'); void stop('unavailable'); }, startupTimeoutMs);
      startup.unref();
    } catch { void stop('unavailable'); }
    return readiness;
  }
  function embed(text) {
    if (state !== 'ready' || pending.size >= 64) return Promise.reject(new Error('Embedding worker not ready'));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { void stop('unavailable'); }, inferenceTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, text }); }
      catch { void stop('unavailable'); }
    });
  }
  return { start, status, embed, close: () => stop('closed') };
}
