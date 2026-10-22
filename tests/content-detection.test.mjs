import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
const root = new URL('..', import.meta.url).pathname;
const domain = readFileSync(join(root, 'domain-utils.js'), 'utf8');
const content = readFileSync(join(root, 'content.js'), 'utf8');

async function load({target=true, url='https://fps-arena-rosy.vercel.app/' }={}) {
  const appended=[];
  const scripts = [{ src: '/socket.io/socket.io.js' }, { src: '/client/main.js' }];
  const document = {
    scripts,
    querySelector(selector) {
      if (selector === '#gl' || selector === '#hud') return target ? {} : null;
      if (selector === '#gl, #hud') return target ? {} : null;
      return null;
    },
    createElement:()=>({ remove(){} }),
    head:{appendChild(element){appended.push(element)}},
    addEventListener(){}, dispatchEvent(){},
  };
  const browser={
    storage:{local:{get:async()=>({ customDomains:[], options:{} })},onChanged:{addListener(){}}},
    runtime:{getURL:(f)=>`moz-extension://abc/${f}`,onMessage:{addListener(){}}},
  };
  const context=vm.createContext({document,browser,location:{href:url},URL,CustomEvent,
    fetch:async()=>({ok:true,text:async()=> '// generated payload' }),setTimeout:()=>0});
  vm.runInContext(domain,context);
  vm.runInContext(content,context);
  await new Promise(resolve=>setTimeout(resolve,15));
  return appended;
}

test('2026-10-09 Vercel web DOM: content agent is injected with #gl and #hud',async()=>{
  const scripts=await load();
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].type,'module');
  assert.equal(scripts[0].textContent,'// generated payload');
});
test('origin allowlist and game DOM both gate injection',async()=>{
  assert.equal((await load({url:'https://another.example.com/'})).length,0);
  assert.equal((await load({target:false})).length,0);
});
