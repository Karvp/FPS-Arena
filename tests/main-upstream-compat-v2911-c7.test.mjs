import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {WEAPONS as preserved} from '../lab/arena/source/shared/weapons.js';
import {WEAPONS as upstream} from '../lab/arena/source-main/shared/weapons.js';
import {Game as UpstreamGame} from '../lab/arena/source-main/server/game.js';
import {MAPS as upstreamMaps} from '../lab/arena/source-main/maps/index.js';
import {SKILLS as upstreamSkills} from '../lab/arena/source-main/shared/skills.js';
import {ATT} from '../lab/arena/source-main/shared/attachments.js';

test('C7 preserves the original C6 engine snapshot and the uploaded main engine side by side',()=>{
 assert.ok(Object.keys(preserved).length>Object.keys(upstream).length,
   'The two catalogs must not be silently substituted');
 assert.ok(preserved.benelli_m4,'Preserve previously evaluated C6 shotgun');
 assert.equal(upstream.benelli_m4,undefined,'Never label an unsupported main weapon as playable');
 assert.ok(upstream.aa12,'Use an actual main shotgun in new simulations');
});
test('main game integration includes the new shooting range and all original combat maps',()=>{
 for(const id of ['arena','neon','foundry','oilrig','marsh','range'])assert.ok(upstreamMaps[id],id);
 assert.equal(typeof UpstreamGame.prototype.step,'function');
});
test('main engine capabilities are present without weakening old safety gates',()=>{
 assert.ok(Object.keys(upstreamSkills).length>=10);
 assert.ok(Object.keys(ATT).length>=4);
 const core=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
 assert.match(core,/__FPSARENA_HEADLESS_LAB__/);
 assert.ok(existsSync(new URL('../lab/arena/train-main.mjs',import.meta.url)));
});
test('new engine simulation resolves to the uploaded main module paths, not pinned C6 source',()=>{
 const source=readFileSync(new URL('../lab/arena/train-main.mjs',import.meta.url),'utf8');
 const headless=readFileSync(new URL('../lab/arena/headless-client-main.mjs',import.meta.url),'utf8');
 const opponent=readFileSync(new URL('../lab/arena/unrestricted-opponent-main.mjs',import.meta.url),'utf8');
 for(const content of [source,headless,opponent]){
  assert.match(content,/\.\/source-main\/shared\/weapons\.js/);
  assert.doesNotMatch(content,/['"]\.\/source\/shared\/weapons\.js['"]/);
 }
});
