// Compare deterministic C9 static envelopes with the *actual* uploaded-main
// ray/spread/damage geometry under matched (stationary, unoccluded) assumptions.
import {writeFileSync,mkdirSync} from 'node:fs';
import {WEAPONS,damageAt,spreadFor} from '../lab/arena/source-main/shared/weapons.js';
import {gunStats} from '../lab/arena/source-main/shared/attachments.js';
import {PLAYER} from '../lab/arena/source-main/shared/constants.js';
import {mulberry32,hashSeq,spreadDir,rayAABB,raySphere} from '../lab/arena/source-main/shared/geometry.js';
import {estimateEngagementBallistics} from '../engagement-ballistics.mjs';
const samples=1536;
const cases=[
 ['m4a1',40,true,'',0],['m4a1',100,true,'',0],['mp5sd',60,true,'',0],
 ['mp5sd',75,false,'',0],['colt9mm',30,false,'laser',0],['aa12',12,true,'',0],
 ['aa12',28,true,'',0],['hk_sl8',130,true,'',0],['l115a3',180,true,'',0],
 ['wa2000',310,true,'',0],['m4a1',55,true,'suppressor',0],['m4a1',65,true,'',1]
];
const rows=[];
for (const [id,dist,aim,attachment,stance] of cases){
 const w=attachment?gunStats(id,attachment):WEAPONS[id],
   o=[0,1.6,0],y=PLAYER.bodyH[stance]*.6,
   sight=[0,y-1.6,-dist],n=Math.hypot(...sight),b=sight.map(v=>v/n);
 let hits=0,dmg=0,heads=0;
 for(let seq=1;seq<=samples;seq++)for(let j=0;j<w.pellets;j++){
  const d=spreadDir(b,0,spreadFor(w,aim,true),mulberry32(hashSeq(seq,j)));
  const hw=stance===2?.55:PLAYER.bodyHalf,body=rayAABB(o,d,-hw,0,-dist-hw,hw,PLAYER.bodyH[stance],-dist+hw,w.maxRange),
    head=raySphere(o,d,0,PLAYER.headYs[stance],-dist,PLAYER.headRadius,w.maxRange);
  const isHead=head<Infinity&&head<=body+.2,t=isHead?head:body;
  if(t<Infinity){hits++;heads+=+isHead;dmg+=damageAt(w,t)*(isHead?w.headMul:1);}
 }
 const pred=estimateEngagementBallistics(w,dist,{samples:96,aim,stance});
 const hit=hits/(samples*w.pellets),damage=dmg/samples;
 rows.push({id,dist,aim,attachment,stance,predictedPelletHit:pred.pelletHitFraction,
  referencePelletHit:hit,absoluteHitError:Math.abs(pred.pelletHitFraction-hit),
  predictedDamage:pred.expectedDamagePerTrigger,referenceDamage:damage,
  absoluteDamageError:Math.abs(pred.expectedDamagePerTrigger-damage),
  referencePelletHead:heads/(samples*w.pellets)});
}
const metric={meanAbsHitError:rows.reduce((s,r)=>s+r.absoluteHitError,0)/rows.length,
 maxAbsHitError:Math.max(...rows.map(r=>r.absoluteHitError)),
 meanAbsDamageError:rows.reduce((s,r)=>s+r.absoluteDamageError,0)/rows.length,
 maxAbsDamageError:Math.max(...rows.map(r=>r.absoluteDamageError))};
const out={method:'C9 deterministic quadrature vs server-shared spreadDir/rayAABB/raySphere/damageAt',
 boundaries:'unoccluded static target; no actor motion or real player aim correction; not match calibration',
 samplesPerReferenceTrigger:samples,scenarioCount:rows.length,metric,rows};
mkdirSync(new URL('../reports/c9/',import.meta.url),{recursive:true});
writeFileSync(new URL('../reports/c9/geometry-validation.json',import.meta.url),JSON.stringify(out,null,2));
console.log(JSON.stringify(metric));
