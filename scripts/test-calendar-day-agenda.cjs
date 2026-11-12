/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS UI test runner. */
// Install jsdom@26.1.0 in a test environment and expose it via NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

async function main() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = require('react-dom/client');
  const filename = path.resolve(__dirname, '../app/timy/[teamId]/kalendar/training-calendar.tsx');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const component = new Module(filename, module);
  component.filename = filename;
  component.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = component.require.bind(component);
  component.require = name => {
    if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    if (name === '@/components/icons') return { CalendarIcon: () => null, CloseIcon: () => null };
    if (name === './actions') return { createTrainingSeries: async () => {} };
    return originalRequire(name);
  };
  component._compile(compiled, filename);
  const { TrainingCalendar } = component.exports;
  const root = createRoot(document.getElementById('root'));
  const base = { teamId: 'test-team', month: '2026-11', days: [null, 1, 2], events: [
    { nomination_id: 'later', title: 'Večerný tréning', event_type: 'training', starts_at: '2026-11-01T17:00:00Z', ends_at: '2026-11-01T18:00:00Z', location: 'Hala', note: 'Vezmi si vodu' },
    { nomination_id: 'earlier', title: 'Ranný zápas', event_type: 'match', starts_at: '2026-11-01T08:00:00Z', ends_at: null, location: 'Ihrisko', note: null },
  ] };
  const click = async element => { assert.ok(element); await act(async () => element.click()); };
  const button = (scope, text) => [...scope.querySelectorAll('button')].find(el => el.textContent === text);
  const day = (number, mobile = false) => document.querySelectorAll(`button[aria-label="Program dňa ${number}. 2026-11"]`)[mobile ? 1 : 0];
  const render = async canManage => { await act(async () => root.render(React.createElement(TrainingCalendar, { ...base, canManage, key: String(canManage) }))); };
  await render(false);
  await click(day(1));
  let agenda = document.querySelector('dialog');
  assert.equal(agenda.open, true);
  assert.ok(agenda.textContent.includes('Ranný zápas'));
  assert.ok(agenda.textContent.indexOf('Ranný zápas') < agenda.textContent.indexOf('Večerný tréning'));
  assert.ok(agenda.querySelector('a[href="/nominacie/earlier"]'));
  assert.equal(button(agenda, '+ Pridať udalosť'), undefined, 'parent cannot create');
  assert.equal(document.querySelector('form'), null, 'day click never opens creation');
  await click(agenda.querySelector('[aria-label="Zavrieť program dňa"]'));
  await click(day(2, true));
  assert.ok(agenda.textContent.includes('Na tento deň nie je nič naplánované.'));
  await render(true);
  await click(day(1, true));
  agenda = document.querySelector('dialog');
  await click(button(agenda, '+ Pridať udalosť'));
  assert.equal(agenda.open, false);
  assert.equal(document.querySelector('input[name="date"]').value, '2026-11-01');
  await click(button(document.querySelector('form'), 'Zrušiť'));
  await click(day(1));
  await click(button(agenda, 'Kopírovať na iný deň'));
  assert.equal(agenda.open, false);
  await click(day(2));
  assert.equal(document.querySelector('input[name="date"]').value, '2026-11-02');
  assert.equal(document.querySelector('input[name="title"]').value, 'Večerný tréning');
  assert.equal(document.querySelector('input[name="location"]').value, 'Hala');
  assert.equal(document.querySelector('textarea[name="note"]').value, 'Vezmi si vodu');
  await act(async () => root.unmount());
  dom.window.close();
  console.log('PASS: day agenda, chronological events, parent access, empty days, mobile selection, explicit creation and copy');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
