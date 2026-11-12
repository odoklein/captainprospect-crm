const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const esbuild = require('esbuild');

// Browser regression fixture using the production Drawer, including StrictMode.
const root = path.resolve(__dirname, '../..');
const fixture = `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Drawer } from './components/ui/Drawer';
function Fixture() {
  const [action, setAction] = useState(true);
  const [script, setScript] = useState(true);
  const [nested, setNested] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [modal, setModal] = useState(true);
  const [revision, setRevision] = useState(0);
  return <>
    <button id="open-action" onClick={() => setAction(true)}>Open action</button>
    <button id="open-script" onClick={() => setScript(true)}>Open script</button>
    <button id="rerender" onClick={() => setRevision(x => x + 1)}>Rerender</button>
    <button id="toggle-modal" onClick={() => setModal(x => !x)}>Toggle modal</button>
    <output>{revision}</output>
    <Drawer isOpen={action} onClose={() => setAction(false)} title="Action" modal={modal}>
      <button onClick={() => setNested(true)}>Open nested</button>
    </Drawer>
    <Drawer isOpen={script} onClose={() => setScript(false)} title="Script" modal={false} side="left" closeOnOverlay={false}>
      <button onClick={() => setBlocked(true)}>Open blocked</button>
    </Drawer>
    <Drawer isOpen={nested} onClose={() => setNested(false)} title="Nested">Nested form</Drawer>
    <Drawer isOpen={blocked} onClose={() => setBlocked(false)} title="Blocked" closeOnEscape={false}>Explicit close only</Drawer>
  </>;
}
const reactRoot = createRoot(document.getElementById('root'));
let revision = 0;
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const panel = name => document.querySelector('[role="dialog"][aria-label="' + name + '"]');
const close = name => panel(name).querySelector('[aria-label="Fermer le panneau"]').click();
const clickButton = (name, text) => Array.from(panel(name).querySelectorAll('button')).find(button => button.textContent === text).click();
const escape = async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settle();
};
const check = (condition, message) => { if (!condition) throw new Error(message); };
const reset = async () => {
  reactRoot.render(null);
  await settle();
  document.body.style.overflow = 'auto';
  reactRoot.render(<StrictMode><Fixture key={revision++} /></StrictMode>);
  await settle();
};
const tests = [
  ['close script keeps action and scroll lock', async () => {
    close('Script'); await settle();
    check(panel('Action') && !panel('Script'), 'Action must stay open');
    check(document.body.style.overflow === 'hidden', 'Action must retain scroll lock');
  }],
  ['close action keeps script and restores scrolling', async () => {
    close('Action'); await settle();
    check(!panel('Action') && panel('Script'), 'Script must stay open');
    check(document.body.style.overflow === 'auto', 'Original overflow must be restored');
    await escape(); check(!panel('Script'), 'Escape must close solo non-modal script');
  }],
  ['Escape closes one drawer at a time', async () => {
    await escape();
    check(panel('Action') && !panel('Script'), 'First Escape must close only script');
    await escape(); check(!panel('Action'), 'Second Escape must close action');
  }],
  ['nested modal retains parent lock and Escape order', async () => {
    clickButton('Action', 'Open nested'); await settle();
    check(panel('Nested'), 'Nested drawer must open');
    await escape();
    check(!panel('Nested') && panel('Action') && panel('Script'), 'Only nested should close');
    check(document.body.style.overflow === 'hidden', 'Parent modal must keep scroll lock');
    await escape(); check(!panel('Script') && panel('Action'), 'Script should close next');
  }],
  ['rerender preserves stack and scroll lock', async () => {
    document.getElementById('rerender').click(); await settle();
    check(document.body.style.overflow === 'hidden', 'Rerender must retain lock');
    await escape(); check(panel('Action') && !panel('Script'), 'Rerender must retain stack order');
  }],
  ['closeOnEscape false shields underlying drawers', async () => {
    clickButton('Script', 'Open blocked'); await settle();
    await escape();
    check(panel('Blocked') && panel('Script') && panel('Action'), 'Blocked top must shield parents');
    close('Blocked'); await settle();
    check(document.body.style.overflow === 'hidden', 'Parent retains lock after blocked closes');
  }],
  ['modal prop change releases and reacquires scroll lock', async () => {
    document.getElementById('toggle-modal').click(); await settle();
    check(document.body.style.overflow === 'auto', 'Non-modal panels must release lock');
    document.getElementById('toggle-modal').click(); await settle();
    check(document.body.style.overflow === 'hidden', 'Modal must reacquire lock');
  }],
  ['reopening action above script closes only action on Escape', async () => {
    close('Action'); await settle();
    document.getElementById('open-action').click(); await settle();
    await escape();
    check(!panel('Action') && panel('Script'), 'Newest action must close by itself');
    await escape(); check(!panel('Script'), 'Script must still respond to Escape');
  }],
  ['unmount restores overflow and removes stack entries', async () => {
    reactRoot.render(null); await settle();
    check(document.body.style.overflow === 'auto', 'Unmount must restore original overflow');
    await reset(); await escape();
    check(panel('Action') && !panel('Script'), 'Remounted drawers must own the stack');
  }],
];
(async () => {
  const results = [];
  for (const [name, run] of tests) {
    try { await reset(); await run(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  }
  const output = document.createElement('pre');
  output.id = 'results'; output.textContent = JSON.stringify(results);
  document.body.append(output);
})();
`;

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: fixture, resolveDir: root, loader: 'tsx' },
    absWorkingDir: root, bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdr-drawers-'));
  const html = path.join(dir, 'fixture.html');
  fs.writeFileSync(html, '<!doctype html><html><head><title>SDR Drawer regression fixture</title></head><body><div id="root"></div><script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script></body></html>');
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const dom = execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--user-data-dir=' + path.join(dir, 'profile'),
    '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(html).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const match = dom.match(/<pre id="results">(.*?)<\/pre>/s);
  if (!match) throw new Error('Browser did not finish regression checks');
  const results = JSON.parse(match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
  for (const result of results) console.log((result.passed ? 'PASS' : 'FAIL') + ' ' + result.name + (result.error ? ': ' + result.error : ''));
  console.log(results.filter(r => r.passed).length + '/' + results.length + ' checks passed');
  if (results.some(r => !r.passed)) process.exitCode = 1;
})();
