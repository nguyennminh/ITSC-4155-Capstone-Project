import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const MODEL_VERSION = `${MODEL}@${REVISION}:q8:mean:normalized:v1`;
export const DIMENSIONS = 384;
export const modelDirectory = resolve(process.env.MINILM_MODEL_DIR || fileURLToPath(new URL('../../.cache/models/minilm', import.meta.url)));
export const modelFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];

export function validVector(vector) {
  return Array.isArray(vector) && vector.length === DIMENSIONS && vector.every(Number.isFinite)
    && Math.abs(vector.reduce((sum, n) => sum + n * n, 0) - 1) < 0.02;
}
