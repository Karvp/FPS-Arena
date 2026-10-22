import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('authoritative arena full-match flag extends until results with an explicit cap',()=>{
 const s=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
 assert.match(s,/fullMatch=args\.includes\('--full-match'\)/);
 assert.match(s,/fullMatch\?Math\.max\(seconds,600\):seconds/);
 assert.match(s,/metrics\.finishedNaturally=world\.phase!=='match'/);
 assert.match(s,/if\(world\.phase!=='match'\)break/);
});
