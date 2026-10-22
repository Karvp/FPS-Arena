import test from 'node:test';
import assert from 'node:assert/strict';
import {auditExploration,profiles} from '../scripts/c5-exploration-study.mjs';
const sample=()=>({rows:[{map:'arena',weapon:'mp5sd',seed:963101,profiles:Object.fromEntries(profiles.map(p=>[p,{map:'arena',weapon:'mp5sd',seed:963101,kills:1,deaths:0,shots:5,errors:0,plans:0,offers:0,assigned:0,controls:0,completeWindows:0}]))}]});
test('C5 study audit conserves all randomized offers and requires matched profiles',()=>{
 const o=sample();assert.equal(auditExploration(o)[profiles[2]].kills,1);
 delete o.rows[0].profiles.release;assert.throws(()=>auditExploration(o),/Incomplete/);
 const m=sample();m.rows[0].profiles[profiles[2]].offers=1;
 assert.throws(()=>auditExploration(m),/Incorrect randomized/);
 const n=sample();n.rows[0].profiles[profiles[2]].plans=1;
 assert.throws(()=>auditExploration(n),/Plan without/);
});
