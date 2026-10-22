import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraOccluded,planCameraMovement} from '../camera-tactics.mjs';
function segmentAABB(a,b,v){
 let minT=0,maxT=1;
 for(const [l,r,lo,hi] of [[a.x,b.x,v.x0,v.x1],[a.y||0,b.y||0,v.y0,v.y1],[a.z,b.z,v.z0,v.z1]]){
  const delta=r-l;
  if(Math.abs(delta)<1e-9){if(l<lo||l>hi)return false;continue;}
  const x=(lo-l)/delta,y=(hi-l)/delta;
  minT=Math.max(minT,Math.min(x,y));maxT=Math.min(maxT,Math.max(x,y));
  if(minT>maxT)return false;
 }
 return minT<1&&maxT>0;
}
test('optimized broad-phase leaves exact 3D occlusion unchanged across random segments and floors',()=>{
 let seed=72419;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const boxes=Array.from({length:330},()=>{const x=rand()*140-70,z=rand()*140-70,y=rand()*26-3;return {x0:x,x1:x+.2+rand()*5,y0:y,y1:y+.3+rand()*7,z0:z,z1:z+.2+rand()*5};});
 const map={boxes};
 for(let i=0;i<2500;i++){
  const a={x:rand()*140-70,y:rand()*32-3,z:rand()*140-70};
  const b={x:rand()*140-70,y:rand()*32-3,z:rand()*140-70};
  const reference=boxes.some(box=>segmentAABB(a,b,box));
  assert.equal(cameraOccluded(map,a,b),reference,`segment ${i}`);
 }
});
test('a negative cover result is cached without blocking a new target or reload transition',()=>{
 const game={local:{mv:{x:0,y:0,z:0}},map:{boxes:[],bound:60}};
 const enemy={x:0,y:0,z:14,id:'A',yaw:0,aim:true};
 const memo={};
 for(const t of [1,1.2,1.4,1.6]){
  assert.equal(planCameraMovement(game,[enemy],{id:'A',point:{x:0,y:1,z:14}},t,memo,{peek:true}),null);
  assert.equal(memo.updated,1);
 }
 planCameraMovement(game,[enemy],{id:'B',point:{x:1,y:1,z:14}},1.7,memo,{peek:true});
 assert.equal(memo.updated,1.7);
 planCameraMovement(game,[enemy],{id:'B',point:{x:1,y:1,z:14}},1.8,memo,{reloading:true});
 assert.equal(memo.updated,1.8);
 planCameraMovement(game,[enemy],{id:'B',point:{x:1,y:1,z:14}},2.7,memo,{peek:true});
 assert.equal(memo.updated,2.7);
});
