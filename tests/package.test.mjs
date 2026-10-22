import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
test('manifest ships all referenced local files',()=>{
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version,2);
  for(const p of [manifest.browser_action.default_popup, ...manifest.content_scripts.flatMap(s=>s.js),...manifest.background.scripts, 'page-agent.js', 'popup.js','popup.css'])
    assert.ok(fs.existsSync(path.join(root,p)),`missing ${p}`);
  assert.deepEqual(manifest.content_scripts[0].matches,['http://localhost/*','http://127.0.0.1/*','https://fps-arena-rosy.vercel.app/*']);
  assert.ok(manifest.optional_permissions.includes('<all_urls>'));
  assert.ok(manifest.permissions.includes('https://fps-arena-rosy.vercel.app/*'));
  assert.ok(read('popup.html').includes('id="domainInput"'));
  assert.ok(read('popup.html').includes('<script src="domain-utils.js"></script>'));
});
test('generated source in sync with core and imports game client class',()=>{
  const generated=read('page-agent.js');
  assert.ok(generated.includes("import('/client/game.js')"));
  assert.ok(generated.includes('function findTarget('));
  assert.ok(generated.includes('originalLook.apply(this, args)'));
  assert.ok(!generated.includes('export function findTarget'));
});

test('compiled page-agent contains the real zombie escape implementation, not just an unresolved call',()=>{
 const generated=read('page-agent.js');
 assert.ok(generated.includes('function planZombieEscape('));
 assert.ok(generated.includes('function findZombieEscapeRoute('));
 assert.ok(generated.includes('direction=planZombieEscape('));
 assert.ok(!generated.includes("import {zombieKite}"));
});


test('v2.9.11 retains the five-mode lab and offline replay UI',()=>{
 const m=JSON.parse(read('manifest.json'));
 assert.equal(m.version,'2.9.11');
 assert.ok(read('popup.html').includes('openReplayLab'));
 assert.ok(read('popup.js').includes("browser.runtime.getURL('lab/replay.html')"));
 assert.ok(read('lab/replay.html').includes('Match Recorder JSON'));
 assert.ok(read('tools/simulate-all-modes.mjs').includes("tdm"));
 const report=JSON.parse(read('reports/SIMULATION_ALL_MODES.json'));
 assert.deepEqual([...new Set(report.modes.map(m=>m.mode))].sort(),['br','hp','snd','tdm','zm']);
 assert.ok(report.modes.some(m=>m.tier==='controlled'));
 assert.ok(report.modes.some(m=>m.tier==='stress'));
});
