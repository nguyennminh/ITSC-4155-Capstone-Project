import { parentPort, workerData } from 'node:worker_threads';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

try {
  const buffer = Buffer.from(workerData.buffer);
  let text;
  if (workerData.extension === '.pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (info.total > 10) throw new Error('Use a resume with 10 pages or fewer.');
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    text = (await mammoth.extractRawText({ buffer })).value;
  }
  if (text.length > 40000) throw new Error('Resume text is too long. Use a shorter document.');
  if (text.trim().length < 30) throw new Error('No readable resume text found. Scanned PDFs need OCR; use a text PDF or DOCX.');
  parentPort.postMessage({ text });
} catch {
  parentPort.postMessage({ error: 'Could not read this resume. Use an unlocked text PDF (up to 10 pages) or a valid DOCX with selectable text, under 40,000 characters. Scanned PDFs need OCR.' });
}
