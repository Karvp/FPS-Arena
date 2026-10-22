// C33-B adaptive DEVELOPMENT study after C33-A validation-only negative result.
// Add public signed bearing and movement-space features, simulate an enemy BODY
// generally oriented toward the target (the actual weapon aim remains hidden).
import {MAPS} from './source-main/maps/index.js';
import {newMoveState,stepMove} from './source-main/shared/movement.js';
import {MOVE} from './source-main/shared/constants.js';
import {mulberry32} from './source-main/shared/geometry.js';
import {sampleScenarioC33,encounterC33,FEATURE_NAMES_C33} from './map-encounter-c33.mjs';
const round=x=>+x.toFixed(6);
export const FEATURES_C33_B=Object.freeze([...FEATURE_NAMES_C33,'signedWorldLateral/100','predictedLeftDx/.16speed','predictedRightDx/.16speed']);
function probe(s,right){const st=newMoveState(s.tx,0,s.tz);st.vx=s.vx;st.vz=s.vz;const before=st.x;
 for(let i=0;i<10;i++)stepMove(st,{yaw:0,left:!right,right},.016,1,MAPS[s.map].boxes);
 return (st.x-before)/(MOVE.speed*.16);
}
export function sampleRefinedC33(seed,map,weaponId){
 const s=sampleScenarioC33(seed,map,weaponId);
 const r=mulberry32((seed^0xc33b1234)>>>0),heading=-Math.atan2(s.tx-s.sx,s.sz-s.tz);
 s.bodyYaw=round(heading+(r()-.5)*.5);
 return s;
}
export function refinedEncounterC33(s){const r=encounterC33(s),dist=Math.hypot(s.tx-s.sx,s.tz-s.sz);
 r.schema='fpsarena-c33b-real-map-public-state-counterfactual-v1';
 r.publicFeatures.push((s.tx-s.sx)/dist,probe(s,false),probe(s,true));
 if(r.publicFeatures.length!==FEATURES_C33_B.length||!r.publicFeatures.every(Number.isFinite))throw Error('bad public features');
 return r;
}
