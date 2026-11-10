// Injected functions must be self-contained because Chrome serializes them.
export async function importProfile({ href, includeResume }) {
  try {
    const unchanged = () => {
      if (location.href !== href) throw new Error('The tab changed. Reopen JobSwipe and try again.');
    };
    unchanged();
    const request = path => fetch(path, { credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
    const response = await request('/api/profile');
    if (response.status === 401) throw new Error('Sign in to JobSwipe first.');
    if (!response.ok) throw new Error('Could not read the JobSwipe profile.');
    const { user } = await response.json();
    if (!user?.confirmed) throw new Error('Confirm your JobSwipe profile first.');
    const profile = Object.fromEntries(['name', 'email', 'phone'].map(key =>
      [key, typeof user.profile?.[key] === 'string' ? user.profile[key].trim().slice(0, 254) : '']));
    if (!profile.name || !profile.email) throw new Error('Save your name and email in JobSwipe first.');
    const result = { profile };
    if (includeResume) {
      try {
        const file = await request('/api/resumes/file');
        if (file.status === 404) throw new Error('No saved résumé. Upload one in JobSwipe or attach it manually.');
        if (!file.ok) throw new Error('Could not read the saved résumé.');
        const type = file.headers.get('content-type')?.split(';')[0];
        const extensions = { 'application/pdf': '.pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' };
        if (!Object.hasOwn(extensions, type)) throw new Error('Only PDF and DOCX résumés can be imported.');
        const limit = 6 * 1024 * 1024;
        if (Number(file.headers.get('content-length')) > limit) throw new Error('The résumé exceeds 6 MiB. Attach it manually.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!bytes.length || bytes.length > limit) throw new Error('The résumé is empty or exceeds 6 MiB. Attach it manually.');
        let name = `resume${extensions[type]}`;
        try {
          const encoded = file.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
          const decoded = encoded && decodeURIComponent(encoded).replace(/[/\\\x00-\x1f\x7f]/g, '_');
          if (decoded?.toLowerCase().endsWith(extensions[type])) name = decoded;
        } catch { /* Keep the default filename. */ }
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        }
        result.resume = { name, type, content: btoa(binary) };
      } catch (error) { result.note = error.message; }
    }
    unchanged();
    return result;
  } catch (error) { return { error: error.message }; }
}

export async function fillApplication({ href, profile, extras = [], resume, answers = [], scanOnly }) {
  try {
    if (location.href !== href) throw new Error('The tab changed. Open the employer form and try again.');
    const names = control => {
      const by = (control.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent || '').join(' ');
      const labels = [...(control.labels || [])].map(label => {
        const clone = label.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button').forEach(child => child.remove());
        return clone.textContent;
      });
      return [by, control.getAttribute('aria-label'), ...labels].map(label => (label || '').trim()).filter(Boolean);
    };
    const normalized = (value = '') => value.normalize('NFKC').toLowerCase().trim()
      .replace(/(?:\s*(?:\*|:|\(optional\)|\(required\))\s*)+$/g, '')
      .replace(/['’‘]/g, '').replace(/[\p{P}\s]+/gu, ' ').trim();
    const shown = control => control.getClientRects().length > 0 && getComputedStyle(control).visibility === 'visible';
    const usable = control => !control.matches(':disabled') && !control.readOnly && !control.closest('[inert], [aria-hidden="true"]');
    const basic = ['first_name', 'last_name', 'email', 'phone'];
    const byKey = (form, key) => [...form.elements].filter(control => control instanceof HTMLInputElement
      && form.contains(control) && (control.id === key || control.name === key) && ['text', 'email', 'tel'].includes(control.type)
      && usable(control) && shown(control));
    const forms = [...document.forms].filter(form => basic.slice(0, 3).every(key => byKey(form, key).length === 1));
    if (forms.length !== 1) throw new Error('Could not find one supported Greenhouse application form.');
    const [form] = forms;
    const controls = () => [...form.elements].filter(control => form.contains(control) && usable(control)
      && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement));
    const combo = control => control.closest('.select__control');
    const selected = control => combo(control)?.querySelector('.select__single-value, .select__multi-value__label')?.textContent?.trim() || '';
    const uploader = control => control.closest('.file-upload, [role="group"]');
    const isResume = control => control.type === 'file' && (control.id === 'resume' || control.name === 'resume'
      || names(control).some(label => ['résumé', 'resume', 'resume cv', 'cv'].includes(normalized(label))));
    const hasFile = control => Boolean(control.files?.length || [...(uploader(control)?.querySelectorAll('button') || [])]
      .some(button => /^(?:remove|delete)\b/i.test(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim())));
    const visibleFile = control => shown(control) || Boolean(uploader(control) && shown(uploader(control)));
    const matchLabels = (control, labels) => {
      const accepted = new Set(labels.map(normalized));
      const found = names(control);
      return found.length && found.every(label => accepted.has(normalized(label)));
    };
    const emit = control => {
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const filled = [], notes = [];
    if (!scanOnly && profile) {
      const [firstName, ...lastName] = profile.name.trim().split(/\s+/);
      const values = [firstName, lastName.join(' '), profile.email, profile.phone];
      const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      function fillInput(inputs, value, label) {
        if (inputs.length !== 1 || !value || location.href !== href) return;
        const [input] = inputs;
        if (input.value || (input.maxLength >= 0 && value.length > input.maxLength)) return;
        setInput.call(input, value);
        emit(input);
        if (input.value === value) filled.push(label);
      }
      basic.forEach((key, index) => fillInput(byKey(form, key), values[index], ['First name', 'Last name', 'Email', 'Phone'][index]));
      for (const field of extras) {
        const inputs = controls().filter(control => control instanceof HTMLInputElement && shown(control)
          && ['text', 'url'].includes(control.type) && !control.matches('[role="combobox"], [aria-autocomplete]')
          && !control.list && matchLabels(control, field.labels));
        fillInput(inputs, field.value, field.label);
      }

      if (resume && location.href === href) {
        try {
          const inputs = controls().filter(control => isResume(control) && visibleFile(control));
          if (inputs.length !== 1) throw new Error('No unique résumé field found. Attach it manually.');
          const [input] = inputs;
          if (hasFile(input)) throw new Error('Kept the existing résumé attachment.');
          const extension = resume.name.slice(resume.name.lastIndexOf('.')).toLowerCase();
          const accept = input.accept.toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
          if (accept.length && !accept.some(item => [extension, resume.type, '*/*'].includes(item)
            || (item.endsWith('/*') && resume.type.startsWith(item.slice(0, -1))))) {
            throw new Error('The employer does not accept this file type. Attach it manually.');
          }
          const transfer = new DataTransfer();
          transfer.items.add(new File([Uint8Array.from(atob(resume.content), char => char.charCodeAt(0))], resume.name, { type: resume.type }));
          input.files = transfer.files;
          if (!input.files.length) throw new Error('Could not attach the résumé. Attach it manually.');
          emit(input);
          filled.push('Résumé');
          notes.push('Verify that the employer page shows the résumé attachment.');
        } catch (error) { notes.push(error.message); }
      }

      const key = (input, type, code) => input.dispatchEvent(new KeyboardEvent(type, { key: code, code, bubbles: true, cancelable: true }));
      async function waitFor(find) {
        for (let attempt = 0; attempt < 16 && location.href === href; attempt++) {
          const value = find();
          if (value) return value;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        return null;
      }
      function linkedList(control) {
        const list = document.getElementById(control.getAttribute('aria-controls'));
        return list?.getAttribute('role') === 'listbox' ? list : null;
      }
      for (const field of answers) {
        if (location.href !== href) break;
        const choices = controls().filter(control => shown(control) && matchLabels(control, field.labels)
          && (control instanceof HTMLSelectElement && !control.multiple || control.matches('input[role="combobox"]') && combo(control)));
        const primary = choices.filter(control => names(control).some(name => field.primary.map(normalized).includes(normalized(name))));
        const eligible = primary.length ? primary : choices;
        if (eligible.length !== 1) continue;
        const [control] = eligible;
        const options = new Set(field.options.map(normalized));
        if (field.contextual && names(control).some(name => field.contextual.labels.map(normalized).includes(normalized(name)))) {
          options.add(normalized(field.contextual.value));
        }
        if (control instanceof HTMLSelectElement) {
          if (control.selectedOptions[0]?.value && !control.selectedOptions[0].disabled) continue;
          const matches = [...control.options].filter(option => option.value && !option.disabled
            && !option.closest('optgroup[disabled]') && options.has(normalized(option.label)));
          if (matches.length === 1) {
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(control, matches[0].value);
            emit(control);
            if (control.value === matches[0].value) filled.push(field.label);
          }
        } else {
          if (control.value || selected(control) || control.getAttribute('aria-expanded') === 'true') continue;
          control.focus({ preventScroll: true });
          // Greenhouse controls its menu on keyup using event.code.
          key(control, 'keyup', 'ArrowDown');
          let list = await waitFor(() => linkedList(control));
          if (!list && location.href === href && control.getAttribute('aria-expanded') !== 'true') {
            key(control, 'keydown', 'ArrowDown');
            list = await waitFor(() => linkedList(control));
          }
          const matches = list && location.href === href
            ? [...list.querySelectorAll('[role="option"]:not([aria-disabled="true"])')]
              .filter(option => shown(option) && options.has(normalized(option.textContent))) : [];
          if (matches.length === 1) {
            matches[0].click();
            if (await waitFor(() => options.has(normalized(selected(control))))) filled.push(field.label);
          }
          if (location.href === href && control.getAttribute('aria-expanded') === 'true') {
            key(control, 'keydown', 'Escape');
            key(control, 'keyup', 'Escape');
          }
        }
      }
    }

    const missing = new Map();
    const all = controls();
    for (const control of all) {
      const file = control.type === 'file';
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(control.type) || !(file ? visibleFile(control) : shown(control))) continue;
      const group = ['checkbox', 'radio'].includes(control.type) && control.name
        ? all.filter(other => other.type === control.type && other.name === control.name && shown(other)) : [control];
      if (group[0] !== control) continue;
      const blank = file ? !hasFile(control) : ['checkbox', 'radio'].includes(control.type) ? !group.some(item => item.checked)
        : control.matches('input[role="combobox"]') && combo(control) ? !selected(control)
        : control instanceof HTMLSelectElement ? ![...control.selectedOptions].some(option => option.value && !option.disabled)
        : !control.value.trim();
      if (!blank) continue;
      const groupLabel = file ? document.getElementById(uploader(control)?.getAttribute('aria-labelledby'))?.textContent
        : ['checkbox', 'radio'].includes(control.type) ? control.closest('fieldset')?.querySelector('legend')?.textContent : '';
      const label = (isResume(control) ? 'Résumé / CV' : groupLabel || names(control)[0] || 'Unlabeled field').trim().replace(/\s+/g, ' ').slice(0, 160);
      const required = group.some(item => item.required || item.getAttribute('aria-required') === 'true'
        || item.closest('[role="group"][aria-required="true"]'));
      missing.set(label, { label, required: Boolean(required || missing.get(label)?.required) });
    }
    return { filled, notes, missing: [...missing.values()].sort((a, b) => Number(b.required) - Number(a.required)) };
  } catch (error) { return { error: error.message }; }
}
