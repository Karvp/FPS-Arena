import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{inferC35AF,featuresC35AF}from'../lab/arena/long-horizon-inference-c35af.mjs';
const art=JSON.parse(readFileSync(new URL('../reports/c35af/frozen-54/FROZEN-3S-COMBAT-MODELS.json',import.meta.url)));
const sample={gun:'hk_sl8',baselineADS:true,targetRange:30,aimAngleDeg:3,speed:4,lagMs:70};
test('C35AF standalone model is exported and blocked from production',()=>{assert.equal(art.neverUseForProduction,true);assert.equal(art.status,'OFFLINE_ONLY');assert.equal(art.setupSplit.holdout.length,6);});
test('C35AF action features use only pre-step public values',()=>{const x=featuresC35AF(sample),y=featuresC35AF(sample,true);assert.equal(x.length,14);assert.deepEqual(x.slice(0,11),y.slice(0,11));assert.deepEqual(x.slice(-3),[0,0,0]);assert.deepEqual(y.slice(-3),[1,1,0]);});
test('all C35AF frozen model types infer without source server state',()=>{const x=featuresC35AF(sample);for(const [name,m] of Object.entries(art.models)){const f=m.featureSpace==='state'?x.slice(0,11):x;assert.ok(Number.isFinite(inferC35AF(m,f)),name);}});
test('C35AF feature and artifact invalid cases fail closed',()=>{assert.throws(()=>featuresC35AF({...sample,gun:'bogus'}),/inputs/);const x=featuresC35AF(sample);assert.throws(()=>inferC35AF(art.models.action_mlp,x.slice(0,8)),/invalid/);assert.throws(()=>inferC35AF({...art.models.action_mlp,type:'bogus'},x),/unrecognized/);});
