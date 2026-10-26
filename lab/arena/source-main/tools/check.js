// Static project checks: syntax, asset existence, import/export resolution, DOM id references, importmap, server static routes.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [], notes = [];
const err = (m) => errors.push(m);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root).filter(f => f.endsWith('.js'));

// 1. syntax
for (const f of files) { const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }); if (r.status) err(`syntax: ${path.relative(root, f)}\n${r.stderr}`); }
notes.push(`syntax OK for ${files.length} JS files`);

// 2. weapon assets
const { WEAPONS } = await import('../shared/weapons.js');
const PROCEDURAL_WEAPONS = fs.readFileSync(path.join(root, 'client/assets.js'), 'utf8').includes('const EXTERNAL_MODEL_ASSETS = false;');
const PROCEDURAL_ATTACHMENTS = fs.readFileSync(path.join(root, 'client/attachments.js'), 'utf8').includes('const EXTERNAL_ATTACHMENT_ASSETS = false;');
let n = 0;
for (const w of Object.values(WEAPONS)) { if (w.id === 'laser_rifle' || w.unarmed || w.skillWeapon) continue; if (!PROCEDURAL_WEAPONS && !fs.existsSync(path.join(root, w.file))) err(`missing asset ${w.file}`); else n++; }
notes.push(`${Object.keys(WEAPONS).length} weapons, ${PROCEDURAL_WEAPONS ? 'procedural 3D meshes (no external GLB)' : n + ' GLB assets'} configured`);
const { ATT } = await import('../shared/attachments.js');
let na = 0; for (const a of Object.values(ATT)) { if (!PROCEDURAL_ATTACHMENTS && !fs.existsSync(path.join(root, a.file))) err(`missing attachment asset ${a.file}`); else na++; }
notes.push(`${PROCEDURAL_ATTACHMENTS ? 'Procedural attachments' : na + ' attachment models'} present`);

// 2b. recorded audio used by skills (Iphone Kupi). Missing files do not break the game (the client reports them loudly), so this is a WARNING, not an error.
const { SKILLS } = await import('../shared/skills.js');
for (const f of [SKILLS.kupi.audio, SKILLS.kupi.deathAudio]) { if (fs.existsSync(path.join(root, f))) notes.push(`audio file present: ${f}`); else console.warn(`  ! WARNING: missing audio file ${f} (Iphone Kupi will show \"AUDIO FILE MISSING\" in game until it is added)`); }

// 3. imports / exports
const exportsOf = (f) => {
  const s = fs.readFileSync(f, 'utf8'), set = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z0-9_$]+)/g)) set.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach(x => set.add(x.trim().split(/\s+as\s+/).pop()));
  if (/export\s+default/.test(s)) set.add('default');
  return set;
};
const resolve = (from, spec) => spec.startsWith('/') ? path.join(root, spec) : path.resolve(path.dirname(from), spec);
const hasThree = fs.existsSync(path.join(root, 'node_modules/three'));
for (const f of files.filter(f => /\/(client|shared|maps|server)\//.test(f) || f.endsWith('server.js'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/import\s+(?:([\w$*\s{},]+?)\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const spec = m[2], clause = m[1] || '';
    if (spec === 'three' || spec.startsWith('three/addons/')) { if (hasThree && spec !== 'three' && !fs.existsSync(path.join(root, 'node_modules/three/examples/jsm', spec.slice(13)))) err(`${path.relative(root, f)}: missing three addon ${spec}`); continue; }
    if (/^(node:|express|socket\.io)/.test(spec)) continue;
    const target = resolve(f, spec);
    if (!fs.existsSync(target)) { err(`${path.relative(root, f)}: cannot resolve import '${spec}'`); continue; }
    const named = clause.match(/\{([^}]+)\}/);
    if (named) { const ex = exportsOf(target); for (const nm of named[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!ex.has(nm)) err(`${path.relative(root, f)}: '${nm}' is not exported by ${spec}`); }
    if (/^\s*\w+\s*(,|$)/.test(clause) && !clause.startsWith('{') && !clause.startsWith('*') && !exportsOf(target).has('default')) err(`${path.relative(root, f)}: no default export in ${spec}`);
  }
}
notes.push('imports/exports resolve');

// 4. DOM ids referenced by client code exist in index.html
const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set();
for (const f of files.filter(f => f.includes('/client/'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:\$|getElementById)\(\s*'([\w-]+)'\s*\)/g)) used.add(m[1]);
  for (const m of s.matchAll(/for \(const id of \[([^\]]+)\]\) this\.e\[id\]/g)) for (const x of m[1].matchAll(/'([\w-]+)'/g)) used.add(x[1]);
  for (const m of s.matchAll(/\[\s*'(s-\w+)',\s*'\w+'/g)) { used.add(m[1]); used.add('v-' + m[1].slice(2)); }
  for (const m of s.matchAll(/\$\('(team-|)'\s*\+/g)) void m;
}
used.add('team-red'); used.add('team-blue');
for (const u of used) if (!ids.has(u)) err(`client references #${u} which is not in index.html`);
notes.push(`${used.size} DOM ids referenced, all present`);
for (const need of ['screen-menu', 'screen-lobby', 'screen-loadout', 'screen-settings', 'screen-results', 'hud', 'preview-canvas', 'gl']) if (!ids.has(need)) err('index.html missing #' + need);

// 5. importmap + scripts
const im = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
try { const j = JSON.parse(im[1]); if (!j.imports.three || !j.imports['three/addons/']) err('importmap lacks three / three/addons/'); } catch (e) { err('importmap invalid'); }
if (!/<script type="module" src="\/client\/main\.js">/.test(html)) err('index.html does not load /client/main.js');
if (!/socket\.io\/socket\.io\.js/.test(html)) err('index.html does not load socket.io client');
notes.push('importmap OK');

// 6. server static routes cover every absolute import root used by the client
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
for (const r of ['/vendor/three', '/assets', '/shared', '/maps', '/client']) if (!srv.includes(`'${r}'`)) err(`server.js does not serve ${r}`);
notes.push('server static routes OK');

// 7. pointer-events safety rule present
const css = fs.readFileSync(path.join(root, 'client/style.css'), 'utf8');
if (!/\.screen\s*\{[^}]*pointer-events:\s*none/.test(css)) err('CSS: .screen must be pointer-events:none');

console.log(notes.map(x => '  ✓ ' + x).join('\n'));
if (errors.length) { console.error('\nERRORS:\n' + errors.map(e => '  ✗ ' + e).join('\n')); process.exit(1); }
console.log('\nAll checks passed.');
