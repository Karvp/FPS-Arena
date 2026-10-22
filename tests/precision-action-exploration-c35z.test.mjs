import test from 'node:test';
import assert from 'node:assert/strict';
import {precisionWeaponBandC35Z,precisionPrecheckC35Z,C35Z_SCHEMA} from '../lab/arena/precision-exploration-c35z.mjs';
import {publicMovementMenuC35V} from '../lab/arena/movement-value-observer-c35v.mjs';
import {CausalActionTeacherC35W,assignmentC35Y} from '../lab/arena/causal-action-teacher-c35w.mjs';
const cmd={forward:true,fire:false,aim:true,slot:-1};
function client(t){return {you:{tm:0},pos:{x:0,y:0,z:40},rig:{yaw:Math.PI,pitch:0},map:{bound:200,boxes:[]},local:{alive:true,team:0,down:false,hp:100,mv:{stance:0,onGround:true,y:0}},remotes:{list:[{id:'enemy',team:1,alive:true,pos:{x:0,y:0,z:82},stance:0,buf:[{t:t-.15,x:0,z:82},{t:t-.07,x:0,z:82}]}]}};}
function sim(weapon,mutate=()=>({}),n=240){const q=new CausalActionTeacherC35W({seed:888,matchId:'q',setupId:'s',weapon,policy:'randomized',exploration:'c35z',cooldown:.6,horizonTicks:12});let mutated=0;
 for(let i=1;i<=n;i++){const t=1+i/60;const a={...cmd,...mutate(i)};const o=q.command(t,client(t),a,a);if(['forward','backward','left','right'].some(k=>!!o[k]!==!!a[k]))mutated++;assert.equal(o.fire,a.fire);assert.equal(o.aim,a.aim);q.afterStep({serverHits:0,serverShots:0,serverKills:0,serverDamageTaken:0,serverAlive:true});}
 return {q:q.finish(),mutated};}
test('metadata-derived sniper/marksman bands available only in explicit precision mode',()=>{
 for(const w of ['hk_sl8','l115a3']){const b=precisionWeaponBandC35Z(w);assert.ok(b&&b.near>0&&b.far>b.near&&b.max>=b.far);const t=2,c=client(t);
  assert.equal(publicMovementMenuC35V(t,c,cmd,cmd,{weapon:w}).valid,false);
  assert.equal(publicMovementMenuC35V(t,c,cmd,cmd,{weapon:w,precisionResearch:true}).valid,true);}
 assert.equal(precisionWeaponBandC35Z('m4a1'),null);
});
test('sniper and DMR have authentic opt-in assignments and no fake outcomes',()=>{
 for(const w of ['hk_sl8','l115a3']){const {q,mutated}=sim(w);assert.ok(q.counts.offers>=4);assert.ok(q.rows.every(r=>r.schema===C35Z_SCHEMA&&r.unselectedOutcomes===null&&r.propensity===r.assignmentDistribution[r.assignedArm]));
 assert.ok(q.rows.every(r=>r.assignedArm===assignmentC35Y(888,r.offerIndex)));assert.equal(mutated,q.counts.modifiedTicks);assert.equal(q.counts.completed+q.counts.censored,q.rows.length);}
});
test('sniper refuses fire frame and priority and retains untouched aim',()=>{
 const {q}=sim('l115a3',i=>({fire:true,reload:true}));assert.equal(q.counts.offers,0);assert.ok(q.counts.refused.priority>0);
 const b=sim('hk_sl8',()=>({fire:true}));assert.equal(b.q.counts.offers,0);assert.ok(b.q.counts.refused['precision-fire-hold']>0);
});
test('precision guard diagnoses multiple factors from public state only',()=>{
 const c=client(2);c.local.hp=20;c.local.mv.onGround=false;
 const v=precisionPrecheckC35Z(2,c,{...cmd,fire:true},{...cmd,fire:true});assert.ok(v.includes('hp-guard'));assert.ok(v.includes('stance-or-air'));assert.ok(v.includes('precision-fire-hold'));
});
test('invalid and unsupported weapons cannot be assigned',()=>{
 assert.equal(precisionWeaponBandC35Z('no-such-gun'),null);
 assert.throws(()=>new CausalActionTeacherC35W({seed:4,matchId:'m',setupId:'s',weapon:'l115a3',exploration:'c35z',policy:'observe'}),/config/);
 const o=sim('no-such-gun');assert.equal(o.q.counts.offers,0);
});
test('server-side reward variations do not affect pre-step assignment',()=>{
 function go(hit){const q=new CausalActionTeacherC35W({seed:934,matchId:'x',setupId:'s',weapon:'hk_sl8',policy:'randomized',exploration:'c35z',cooldown:.6,horizonTicks:12});for(let i=1;i<=240;i++){let t=1+i/60;q.command(t,client(t),cmd,cmd);q.afterStep({serverHits:hit?i:0,serverShots:hit?i:0,serverKills:0,serverDamageTaken:0,serverAlive:true});}return q.finish();}
 const a=go(false),b=go(true);assert.deepEqual(a.rows.map(r=>[r.assignedArm,r.features,r.actionSet]),b.rows.map(r=>[r.assignedArm,r.features,r.actionSet]));assert.ok(a.rows.some((r,i)=>r.outcome?.hitWindow!==b.rows[i].outcome?.hitWindow));
});
