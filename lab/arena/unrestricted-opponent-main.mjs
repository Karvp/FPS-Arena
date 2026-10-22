// Optional adversarial stress actors. Always use the official BotBrain for
// navigation, looting and team objectives, then exercise additional legal
// player actions through the SAME queue and physics. Not a human model or
// an artificial cap on real player accuracy/movement.
import {BotBrain} from './source-main/server/bot.js';
import {WEAPONS} from './source-main/shared/weapons.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {rayWorld} from './source-main/shared/geometry.js';
export class UnrestrictedOpponent extends BotBrain {
 constructor(game,opts={}) {super(game,opts);this.personality=opts.personality||'mobile';this.leanAt=0;this.leanDir=0;this.stanceAt=0;this.firePulse=0;this.lastFired=false;}
 think(p) {
   const input=super.think(p);if(!input || !p.alive || p.heli || p.air || p.down)return input;
   const now=this.g.now,foe=this.nearest(p,this.enemies(p));
   const gun=WEAPONS[p.ws?.guns?.[p.ws.slot]?.id];
   if(now>this.leanAt){this.leanDir=[-1,0,1][Math.floor(Math.random()*3)];this.leanAt=now+0.15+Math.random()*1.7;}
   input.lean=this.leanDir;
   if(now>this.stanceAt){this.stanceAt=now+.2+Math.random()*1.4;
     this.stance=Math.random()<.30?'crouch':Math.random()<.08?'prone':'stand';}
   if(this.stance==='crouch'&&!input.slide)input.crouch=true;
   if(this.stance==='prone'&&!input.slide)input.prone=true;
   if(foe && gun && !gun.unarmed && !gun.melee){
     const e=foe.o,dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz),ey=p.y+eyeHeightOf(p),
       // A stronger aim adversary attacks small hit regions, independent of the
       // FPS Arena baseline bot's center-of-mass accuracy.
       hy=e.y+(e.stance===2?.55:e.stance===1?1.15:1.62);
     const dir=[dx,hy-ey,dz],l=Math.hypot(...dir),visible=l>0&&rayWorld([p.x,ey,p.z],dir.map(v=>v/l),this.g.worldBoxes(),l)>=l-.25;
     if(visible&&d<Math.min(125,gun.maxRange||100)){
       input.yaw=Math.atan2(-dx,-dz);
       input.pitch=Math.atan2(hy-ey,d||.001);
       input.aim=true;
       if(gun.auto!==false){input.fire=true;}
       else {input.fire=!this.lastFired;this.lastFired=input.fire;}
     }else this.lastFired=false;
     // Preserve mode-driven movement; use more complete legal defenses.
     if(d<25&&p.onGround&&this.personality==='mobile'&&now>this.slideAt-.9){input.slide=true;input.crouch=true;}
     if(d<21&&p.skill&&p.energy>30)input.skill=true;
     if(d<16&&(p.thr?.n||0)>0&&Math.random()<.07)input.throw=true;
     if(d>35&&p.armor<p.maxArmor-35&&p.plates>0)input.plate=true;
     if(p.ws.guns[p.ws.slot].mag===0&&p.ws.guns[p.ws.slot].reserve>0)input.reload=true;
   }
   return input;
 }
}
