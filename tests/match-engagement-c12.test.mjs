import test from 'node:test';import assert from 'node:assert/strict';
import {MatchEngagementRecorderC12,publicShotFeatures} from '../lab/arena/match-engagement-recorder-c12.mjs';
import {trainMatchShotNeural,matchSplit,shotVector,flattenDataset,inferHitProbability} from '../lab/arena/match-shot-learner-c12.mjs';
const fake=(x=40)=>({pos:{x:0,z:0},local:{team:'red',mv:{onGround:true},ws:{slot:0,guns:[{id:'mp5sd'}]}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x,z:0},buf:[{t:.9,x:x-.2,z:0},{t:1,x,z:0}]}]}});
const make=(m='arena|a|1',n=0,hit=n%3===0)=>{
 const [mode,map,seed]=m.split('|');return {schema:'fpsarena-c12-in-match-shot-v1',matchId:`${m}-p`,encounterId:`${m}-e`,shotId:`${m}-${n}`,
 mode,map,seed:Number(seed),profile:'release',weaponId:'mp5sd',targetId:'enemy',
 features:{distance:40+n%8,lateralSpeed:2,radialSpeed:1,aim:1,snapshotAge:.08,observedHostiles:3,onGround:1},
 provenance:{featureSource:'delayed-public-client-snapshot'},
 eligibility:{featureComplete:true,ambiguousShot:false,labelSource:'server-hit-events'},
 labels:{serverHit:hit?1:0}};};
test('C12 snapshot-only vector and movement estimation',()=>{
 const v=publicShotFeatures(fake(),1.065,{aim:true});assert.equal(v.targetId,'enemy');
 assert.equal(v.features.aim,1);assert.ok(v.features.radialSpeed>1);
 assert.ok(v.features.snapshotAge>.06);
});
test('C12 shot contains pre-step context, pellets/hit events aggregate by trigger',()=>{
 const r=new MatchEngagementRecorderC12({matchId:'m1',mode:'tdm',map:'arena',seed:1,profile:'release'});
 r.observe(1.02,fake(),{aim:true});r.serverEvent(1.03,60,'shot',{id:'trainee',w:'aa12'});
 r.serverEvent(1.03,60,'hit',{dmg:13});r.serverEvent(1.03,60,'hit',{dmg:9,kill:true});
 const v=r.finish();assert.equal(v.counts.serverShots,1);assert.equal(v.shots[0].labels.serverHitEvents,2);
 assert.equal(v.shots[0].labels.serverDamage,22);assert.equal(v.shots[0].labels.serverKill,1);
 assert.equal(v.shots[0].eligibility.featureComplete,true);
});
test('C12 misses are zero and stale snapshot is ineligible',()=>{
 const r=new MatchEngagementRecorderC12({matchId:'m2',mode:'tdm',map:'arena',seed:2,profile:'release'});
 r.observe(1.9,fake(),{aim:false});r.serverEvent(1.91,81,'shot',{id:'trainee',w:'mp5sd'});
 assert.equal(r.finish().shots[0].labels.serverHit,0);
 assert.equal(r.finish().shots[0].eligibility.featureComplete,false);
});
test('C12 duplicate firing tick flagged, server enemy shot ignored',()=>{
 const r=new MatchEngagementRecorderC12({matchId:'m3',mode:'tdm',map:'arena',seed:3,profile:'release'});
 r.observe(1.03,fake(),{});r.serverEvent(1.03,70,'shot',{id:'bot'});r.serverEvent(1.03,70,'shot',{id:'trainee'});
 r.serverEvent(1.03,70,'shot',{id:'trainee'});
 assert.equal(r.finish().counts.serverShots,2);
 assert.equal(r.finish().counts.eligibleShots,0);
});
test('C12 no server-only label values can become model features',()=>{
 const r=make();assert.equal(shotVector({...r,features:{...r.features,serverHit:1}}).x.length,7);
 assert.equal(shotVector({...r,provenance:{featureSource:'private-server'}}),null);
 assert.equal(shotVector({...r,eligibility:{...r.eligibility,featureComplete:false}}),null);
});
test('C12 paired profiles and repeated shots stay inside one match split',()=>{
 const rows=[];for(let i=0;i<20;i++)for(let j=0;j<10;j++)rows.push(shotVector(make(`tdm|arena|${i+1}`,j)));
 const s=matchSplit(rows);assert.equal(Object.keys(s.groupAssignments).length,20);
 for(const [group,part] of Object.entries(s.groupAssignments))assert.ok(s[part].filter(r=>r.group===group).length===10);
});
test('C12 duplicate shot IDs are not counted twice',()=>{
 const x=make();const r=flattenDataset({matches:[{shots:[x,x]}]});
 assert.equal(r.totalShots,2);assert.equal(r.duplicates,1);assert.equal(r.rows.length,1);
});
test('C12 refuses neural training on small observational dataset',()=>{
 const out=trainMatchShotNeural({matches:[{shots:[make()]}]});
 assert.equal(out.status,'insufficient-independent-in-match-data');assert.equal(out.model,null);
 assert.equal(out.productionEligible,false);assert.equal(out.policyActuationEnabled,false);
});
test('C12 tiny MLP is trainable but test grouped and never production eligible',()=>{
 const matches=[];for(let i=0;i<18;i++)matches.push({shots:Array.from({length:20},(_,j)=>make(`tdm|arena|${i+100}`,j,(j%4===0)))});
 const r=trainMatchShotNeural({matches},{epochs:12});assert.equal(r.status,'research-model-evaluated');
 assert.equal(r.split.train+r.split.valid+r.split.test,18);assert.ok(r.holdout.n>0);
 assert.equal(r.productionEligible,false);assert.ok(inferHitProbability(r.model,[.2,0,0,1,.1,.2,1])>=0);
});
