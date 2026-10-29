import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResume } from '../src/services/resumeService.js';

test('an unreadable resume reports a local-file error without sending a request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Upload must not start'));
  const cause = new DOMException('File is unavailable', 'NotReadableError');
  const file = { arrayBuffer: async () => { throw cause; } };
  await assert.rejects(parseResume(file), error => {
    assert.match(error.message, /Could not read your resume.*Download a local copy/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 0);
});

test('upload sends readable bytes with the original filename, type and cancellation signal', async t => {
  const file = new File(['resume contents'], 'resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const controller = new AbortController();
  const parsed = { fields: { skills: 'Python' }, resumeName: file.name };
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/resumes/parse');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.signal, controller.signal);
    const uploaded = options.body.get('resume');
    assert.equal(uploaded.name, file.name);
    assert.equal(uploaded.type, file.type);
    assert.equal(await uploaded.text(), await file.text());
    return Response.json(parsed);
  });
  assert.deepEqual(await parseResume(file, controller.signal), parsed);
});

test('cancelling while reading a resume prevents the upload', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Upload must not start'));
  const controller = new AbortController();
  const file = { arrayBuffer: async () => { controller.abort(); return new ArrayBuffer(0); } };
  await assert.rejects(parseResume(file, controller.signal), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 0);
});
