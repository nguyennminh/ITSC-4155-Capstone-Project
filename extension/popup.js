import { customOrigin, extraFields, pageKind, selections, selfIdFields } from './settings.js';
import { fillApplication, importProfile } from './page-actions.js';

const get = id => document.getElementById(id);
const status = get('status');
const key = 'jobswipeImport';
let busy = false;

async function load() {
  const { [key]: entry } = await chrome.storage.session.get(key);
  if (entry?.expires > Date.now()) return entry;
  if (entry) await chrome.storage.session.remove(key);
  return null;
}

function guarded(action) {
  return async event => {
    event?.preventDefault();
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = '';
    try { await action(); }
    catch (error) { status.textContent = error.message || 'Could not complete this action.'; }
    finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
      if (status.textContent) status.scrollIntoView({ block: 'nearest' });
    }
  };
}

async function run(tab, func, args) {
  const [frame] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args: [args] });
  if (!frame?.result) throw new Error('Could not access this page. Reopen the extension on the correct tab.');
  if (frame.result.error) throw new Error(frame.result.error);
  return frame.result;
}

function item(text) {
  const node = document.createElement('li');
  node.textContent = text;
  return node;
}

function showImport(entry, kind) {
  const answers = selections(entry?.selfId);
  get('details').textContent = entry ? 'Imported details are available for 15 minutes.' : '';
  get('clear').hidden = !entry;
  get('selected-data').hidden = kind !== 'application' || (!entry?.resume && !answers.length);
  get('resume-option').hidden = !entry?.resume;
  get('filename').textContent = entry?.resume ? `Attach ${entry.resume.name}` : '';
  get('self-id-option').hidden = !answers.length;
  get('answer-preview').replaceChildren(...answers.map(answer => item(`${answer.label}: ${answer.options[0]}`)));
}

function showResult(result) {
  status.textContent = [
    result.filled.length ? `Filled: ${result.filled.join(', ')}.` : 'No fields were changed.',
    ...result.notes,
  ].join('\n');
  const gaps = result.missing.map(field => item(`${field.label} · ${field.required ? 'Required' : 'Optional'}`));
  get('remaining-list').replaceChildren(...(gaps.length ? gaps : [item('No blank fields detected. Review the page for validation messages.')]));
  get('remaining').hidden = false;
  if (gaps.length) get('remaining-title').scrollIntoView({ block: 'nearest' });
}

function addField(parent, field, value, options) {
  const label = document.createElement('label');
  label.textContent = field.label;
  const control = document.createElement(options ? 'select' : 'input');
  control.id = `saved-${field.key}`;
  if (options) {
    for (const [optionValue, optionLabel] of [['', 'Leave blank'], ...options.map(([label]) => [label, label])]) {
      control.add(new Option(optionLabel, optionValue));
    }
  } else {
    control.type = field.type || 'text';
    control.maxLength = 500;
  }
  control.value = value || '';
  label.append(control);
  parent.append(label);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { origin = '' } = await chrome.storage.local.get('origin');
  const kind = pageKind(tab?.url, origin);
  const entry = await load();
  showImport(entry, kind);
  get('origin').value = origin;
  get('instructions').textContent = {
    jobswipe: 'Import your confirmed profile from this signed-in JobSwipe tab.',
    application: 'Review the selected details, then fill this Greenhouse application.',
    unsupported: 'Open your JobSwipe app to import, or a standard Greenhouse job page to fill. If JobSwipe is hosted, save its HTTPS address below.',
  }[kind];
  get('import-options').hidden = kind !== 'jobswipe';
  get('apply-options').hidden = kind !== 'application';
  get('import').hidden = kind !== 'jobswipe';
  get('fill').hidden = kind !== 'application';
  get('scan').hidden = kind !== 'application';
  const connection = get('connection');
  connection.hidden = kind === 'application';
  if (origin) connection.querySelector('summary').textContent = 'Change JobSwipe connection';
  else if (kind === 'unsupported') connection.open = true;

  get('connection-form').onsubmit = guarded(async () => {
    const value = customOrigin(get('origin').value);
    await chrome.storage.local.set({ origin: value });
    await chrome.storage.session.remove(key);
    location.reload();
  });

  if (kind === 'jobswipe') {
    for (const field of extraFields) addField(get('extras'), field, entry?.extras?.[field.key]);
    for (const field of selfIdFields) addField(get('self-id'), field, entry?.selfId?.[field.key], field.options);
    get('import-resume').checked = Boolean(entry?.resume);
    get('import').onclick = guarded(async () => {
      const extras = Object.fromEntries(extraFields.map(field => {
        const value = get(`saved-${field.key}`).value.trim();
        if (value && field.type === 'url') {
          let url;
          try { url = new URL(value); } catch { throw new Error(`${field.label} needs a valid HTTPS address.`); }
          if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${field.label} needs a valid HTTPS address.`);
        }
        return [field.key, value];
      }));
      const selfId = Object.fromEntries(selfIdFields.map(field => [field.key, get(`saved-${field.key}`).value]));
      await chrome.storage.session.remove(key);
      showImport(null, kind);
      const { note, ...imported } = await run(tab, importProfile, { href: tab.url, includeResume: get('import-resume').checked });
      const saved = { ...imported, extras, selfId, expires: Date.now() + 15 * 60 * 1000 };
      await chrome.storage.session.set({ [key]: saved });
      showImport(saved, kind);
      status.textContent = ['Imported. Open a Greenhouse application to continue.', note].filter(Boolean).join('\n');
    });
  }
  if (kind === 'application') {
    get('fill').onclick = guarded(async () => {
      const saved = await load();
      showImport(saved, kind);
      if (!saved) throw new Error('Open JobSwipe and import your profile first.');
      showResult(await run(tab, fillApplication, {
        href: tab.url, profile: saved.profile,
        extras: extraFields.map(field => ({ ...field, value: saved.extras?.[field.key] || '' })),
        ...(get('attach').checked && saved.resume ? { resume: saved.resume } : {}),
        answers: get('fill-self-id').checked ? selections(saved.selfId) : [],
      }));
    });
    get('scan').onclick = guarded(async () => showResult(await run(tab, fillApplication, { href: tab.url, scanOnly: true })));
  }
  get('clear').onclick = guarded(async () => {
    await chrome.storage.session.remove(key);
    showImport(null, kind);
    status.textContent = 'Imported data cleared.';
  });
}
init().catch(() => { status.textContent = 'Could not open JobSwipe Autofill. Close and reopen it.'; });
