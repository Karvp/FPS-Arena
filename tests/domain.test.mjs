import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = (await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'domain-utils.js'),'utf8').replace("if (typeof module !== 'undefined' && module.exports) module.exports = FPSDomainConfig;",'globalThis.__testAPI=FPSDomainConfig;')).toString('base64'))).__testAPI;
// ESM globalThis export is in the data module's global scope.
const API = globalThis.__testAPI;

test('the production Vercel domain and localhost ports are active by default', () => {
  assert.equal(API.DEFAULT_ORIGINS[0], 'https://fps-arena-rosy.vercel.app');
  assert.equal(API.isAllowedOrigin('https://fps-arena-rosy.vercel.app/'), true);
  assert.equal(API.isAllowedOrigin('https://fps-arena-rosy.vercel.app/client/main.js'), true);
  assert.equal(API.isAllowedOrigin('http://localhost:3000/#home'), true);
  assert.equal(API.isAllowedOrigin('http://127.0.0.1:9999'), true);
  assert.equal(API.isAllowedOrigin('https://another-vercel-site.vercel.app'), false);
});
test('custom domain normalization handles full URLs, case and path and protects scheme', () => {
  assert.equal(API.normalizeOrigin('  https://GAMES.Example.com/match?abc=1  '),'https://games.example.com');
  assert.equal(API.normalizeOrigin('arena.example.org'),'https://arena.example.org');
  assert.equal(API.normalizeOrigin('http://localhost:3000/x'),'http://localhost:3000');
  assert.equal(API.normalizeOrigin('https://arena.example.org:8080/'),'https://arena.example.org:8080');
  for(const invalid of ['','ftp://example.org','https://user:pass@example.org','http://example.org','*.example.org','javascript:alert(1)','https://example.com./'])
    assert.throws(() => API.normalizeOrigin(invalid), undefined, invalid);
});
test('allowlist persists custom exact origins and does not overauthorize ports', () => {
  const stored = API.sanitizeCustomDomains(['https://games.example.com/some/path','https://games.example.com/','https://game.example.com:8443','https://fps-arena-rosy.vercel.app','invalid://']);
  assert.deepEqual(stored,['https://games.example.com','https://game.example.com:8443']);
  assert.equal(API.isAllowedOrigin('https://games.example.com/',stored),true);
  assert.equal(API.isAllowedOrigin('https://game.example.com:8443/',stored),true);
  assert.equal(API.isAllowedOrigin('https://game.example.com:9443/',stored),false);
  assert.equal(API.isAllowedOrigin('http://games.example.com/',stored),false);
  assert.equal(API.isAllowedOrigin('https://games.example.com.evil.invalid',stored),false);
  assert.equal(API.matchPattern('https://game.example.com:8443'),'https://game.example.com/*');
});
test('dynamic host permissions register a script and stop registration on deletion', async () => {
  const permissions = new Set(['https://game.example.com/*']);
  const active = new Map();
  const called = [];
  let domains = ['https://game.example.com'];
  const listeners = {};
  const browser = {
    storage:{ local:{get:async()=>({ customDomains:domains })},onChanged:{addListener(fn){listeners.onChanged=fn}}},
    permissions:{ contains:async({origins})=>origins.every(x=>permissions.has(x)),onAdded:{addListener(fn){listeners.onAdded=fn}},onRemoved:{addListener(fn){listeners.onRemoved=fn}}},
    contentScripts:{register:async(params)=>{
      const pattern=params.matches[0];called.push({type:'register',pattern,files:params.js.map(x=>x.file)});
      active.set(pattern,true);
      return {unregister:async()=>{called.push({type:'unregister',pattern});active.delete(pattern)}};
    }},
    tabs:{query:async()=>[{id:1,url:'https://game.example.com/play'},{id:2,url:'https://evil.example.org'}],
      executeScript:async(id,detail)=>called.push({type:'inject',id,file:detail.file})}
  };
  const context = vm.createContext({ browser, console, URL });
  vm.runInContext(fs.readFileSync(path.join(root,'domain-utils.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),context);
  await vm.runInContext('queueReconcile()',context);
  assert.equal(active.get('https://game.example.com/*'),true);
  assert.deepEqual(called.filter(x=>x.type==='inject').map(x=>x.id),[1,1]);
  assert.deepEqual(Array.from(called.find(x=>x.type==='register').files),['/domain-utils.js','/content.js']);
  assert.ok(!called.some(x=>x.id===2));
  domains=[];
  await vm.runInContext('queueReconcile()',context);
  assert.equal(active.size,0);
  assert.equal(called.filter(x=>x.type==='unregister').length,1);
});
