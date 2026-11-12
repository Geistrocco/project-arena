/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS UI runner. */
// Install jsdom@26.1.0 in the test environment and expose via NODE_PATH.
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
  global.window = dom.window; global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const filename = path.resolve(__dirname, '../components/training-management.tsx');
  const compiled = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop:true } }).outputText;
  const component = new Module(filename,module); component.filename=filename;
  component.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=component.require.bind(component);
  component.require=name=>name==='@/app/timy/[teamId]/kalendar/actions'?{manageTraining:async()=>({error:''})}:original(name);
  component._compile(compiled,filename);
  const root=createRoot(document.getElementById('root'));
  const props={event:{nomination_id:'test',title:'Tréning',starts_at:'2030-03-24T16:00:00Z',ends_at:'2030-03-24T17:30:00Z',location:'Ihrisko',note:'Voda'},info:{version:'abc',series:true,editable:true,all_count:10,following_count:6}};
  await act(async()=>root.render(React.createElement(component.exports.TrainingManagement,props)));
  const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent===text);
  const click=async el=>{assert.ok(el);await act(async()=>el.click());};
  await click(button('Upraviť tréning'));
  assert.equal(document.querySelector('[name="scope"]').value,'one');
  assert.equal(document.querySelector('[name="startsAt"]').value,'2030-03-24T17:00');
  assert.equal(document.querySelector('[name="confirm"]'),null,'single edit needs no batch confirmation');
  const scope=document.querySelector('[name="scope"]');
  await act(async()=>{scope.value='all';scope.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(document.querySelector('[name="confirm"]').required,true);
  assert.ok(document.body.textContent.includes('Počet dotknutých tréningov: 10'));
  await click(button('Späť bez uloženia'));
  await click(button('Zrušiť tréning'));
  assert.equal(document.querySelector('[name="reason"]').required,true);
  assert.equal(document.querySelector('[name="confirm"]').required,true);
  assert.equal(document.querySelector('[name="operation"]').value,'cancel');
  assert.equal(document.querySelector('[name="title"]'),null,'cancellation does not submit editable fields');
  await act(async()=>root.unmount()); dom.window.close();
  console.log('PASS: default single edit, Slovak time, batch scope count/confirmation, cancellation reason and confirmation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
