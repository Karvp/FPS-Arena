import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tacticalFirstShotWindow,tacticalCandidates} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const origin={x:0,y:0,z:0};
const far={x:140,y:0,z:0};
const allRange={min:0,max:200,speed:7};
const base={maxShotProbes:8,shotProbeSpacing:5,walkable:()=>true};
test('experimental coverage is strictly opt-in and limited to headless adapter',()=>{
  assert.equal(normaliseOptions({}).tacticalDirectorShotProbeCoverage,false);
  assert.equal(normaliseOptions({tacticalDirectorShotProbeCoverage:true}).tacticalDirectorShotProbeCoverage,true);
  const source=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
  assert.match(source,/shotProbeCoverage:options\.tacticalDirectorShotProbeCoverage===true\s*&&\s*globalThis\.__FPSARENA_HEADLESS_LAB__===true/);
});
test('coverage discovers a late LOS opening after sequential probe budget exhausts',()=>{
  const route=[{x:100,y:0,z:0}];let rays=0;
  const p={...base,shotClear:(eye)=>{rays++;return eye.x>=76;}};
  const old=tacticalFirstShotWindow(route,origin,far,allRange,p);
  assert.equal(old,null);assert.equal(rays,8);
  rays=0;
  const coverage=tacticalFirstShotWindow(route,origin,far,allRange,{...p,shotProbeCoverage:true});
  assert.ok(coverage);assert.ok(coverage.travel>=76&&coverage.travel<=100);
  assert.equal(coverage.segmentIndex,0);assert.ok(coverage.segmentFraction>0);
  assert.ok(rays<=8);assert.ok(coverage.probes<=8);
  assert.ok(coverage.coverageSampled>=20);
});
test('coverage never claims an obstructed or unwalkable shot and keeps LOS upper bound',()=>{
  for(const scan of [{walkable:()=>false,shotClear:()=>true},
    {walkable:()=>true,shotClear:()=>false}]){
    let rays=0;
    const o=tacticalFirstShotWindow(Array.from({length:20},(_,i)=>({x:5*(i+1),y:0,z:0})),
      origin,far,allRange,{...base,...scan,shotClear:(...a)=>{rays++;return scan.shotClear(...a);},shotProbeCoverage:true});
    assert.equal(o,null);assert.ok(rays<=8);
  }
});
test('coverage returns segment-index preserving every corner in a winding route',()=>{
  const route=[{x:0,y:0,z:40},{x:110,y:0,z:40},{x:110,y:0,z:0}];
  const w=tacticalFirstShotWindow(route,origin,{x:120,y:0,z:0},allRange,
    {...base,shotProbeCoverage:true,shotClear:eye=>eye.x>=70&&eye.z>=39});
  assert.ok(w);assert.equal(w.segmentIndex,1);
  assert.ok(w.segmentFraction>0&&w.segmentFraction<=1);
  const prefix=[...route.slice(0,w.segmentIndex),w.point];
  assert.deepEqual(prefix[0],route[0]);
  assert.equal(prefix.length,2);
  assert.ok(w.travel>40);
});
test('coverage rejects malformed geometry and zero probe budget',()=>{
  assert.equal(tacticalFirstShotWindow([{x:NaN,y:0,z:0}],origin,far,allRange,
    {...base,shotProbeCoverage:true,shotClear:()=>true}),null);
  assert.equal(tacticalFirstShotWindow([{x:100,y:0,z:0}],origin,far,allRange,
    {...base,shotProbeCoverage:true,maxShotProbes:0,shotClear:()=>true}),null);
});
test('coverage never adds A* attempts to candidate expansion',()=>{
  let routed=0;
  const game={local:{alive:true,mv:origin,hp:100,armor:80,weapon:{cat:'Shotgun'},ws:{}}};
  const target={id:'enemy',point:{x:34,y:0,z:0},visible:false};
  const p={...base,engagementWindow:true,opportunityExpansion:true,shotProbeCoverage:true,
    maxRoutes:3,maxProbes:28,route:(a,b)=>{routed++;return [b];},
    shotClear:()=>true,riskAt:()=>0,canStep:()=>true};
  const out=tacticalCandidates(game,target,p);
  assert.ok(routed<=3);assert.ok(out.length<=3);
  for(const item of out){assert.ok(item.waypoints.length>0);assert.ok(item.travel>=0);}
});
test('integrated route-prefix salvage keeps navigational corners under coverage mode',()=>{
  const game={local:{alive:true,mv:origin,hp:100,armor:80,weapon:{cat:'Shotgun'},ws:{}}};
  const target={id:'enemy',point:{x:34,y:0,z:0},visible:false};
  const opts=tacticalCandidates(game,target,{...base,engagementWindow:true,
    shotProbeCoverage:true,opportunityExpansion:true,maxRoutes:3,maxProbes:28,
    route:(a,b)=>[{x:0,y:0,z:25},{x:30,y:0,z:25},{x:30,y:0,z:0},b],
    shotClear:(eye)=>eye.x>=29&&Math.abs(eye.z)<=20,
    riskAt:()=>0,canStep:()=>true});
  assert.ok(opts.length>0);
  for(const o of opts){
    if(!o.earlyShotWindow)continue;
    assert.deepEqual(o.waypoints[0],{x:0,y:0,z:25});
    assert.deepEqual(o.waypoints[1],{x:30,y:0,z:25});
    assert.ok(o.waypoints.length>=3,'early point is appended *after* both navigation corners');
  }
  assert.ok(opts.some(x=>x.earlyShotWindow));
});
