// Browser-free client surface. The EXACT bundled page-agent.js patches these Game methods.
import {CameraRig} from './headless-camera.mjs';
import {WEAPONS} from './source-main/shared/weapons.js';
import {PLAYER} from './source-main/shared/constants.js';
export class Game {
  constructor() {
    this.rig=new CameraRig(); this.running=true; this.phase='match';this.matchId=0;
    this.pos={x:0,y:0,z:0}; this.map={boxes:[],bound:68};
    this.net={id:'trainee'}; this.you={tm:0};this.modeState={type:'tdm'};
    this.names=new Map();this.players=[];this.remotes={list:[]};this.zremotes={list:[]};this.bremotes={list:[]};
    this.loot={crates:[],items:[]};
    this.input={locked:true,enabled:true,aimHeld:false,sample:()=>({forward:false,backward:false,left:false,right:false,
      fire:false,aim:false,reload:false,slot:-1,use:false,interact:false,plate:false,slide:false,crouch:false,
      prone:false,jump:false,lean:0,skill:false,throw:false})};
    this.local={alive:false,team:'red',hp:100,armor:0,plates:0,maxArmor:50,ws:null,
      mv:{x:0,y:0,z:0,vx:0,vy:0,vz:0,onGround:true,lean:0},weapon:WEAPONS.fists};
  }
  frame(dt=1/60,active=true,paused=false){this.rig.look(0,0,0.01);}
  simTick(){this.sampled=this.input.sample();return this.sampled;}
  onSnap(s){
    this.phase=s.phase;this.matchId=s.mid;this.modeState=s.mode||this.modeState;
    this.you=s.you;
    const pl=s.pl||[];const self=pl.find(p=>p.id===this.net.id);
    if(self){this.local.alive=!!self.al&&!self.dn;this.local.hp=self.hp;this.local.frozen=!!s.you?.fz;
      this.local.armor=s.you?.armor??0;this.local.plates=s.you?.plates??0;
      this.local.maxArmor=s.you?.maxArmor??PLAYER.maxArmor;
      this.local.ws=s.you?.ws;this.local.mv={...this.local.mv,...Object.fromEntries(['x','y','z','vx','vy','vz','lean','stance','onGround','heli','air','slideT'].map(k=>[k,s.you?.[k]??this.local.mv[k]]))};
      this.pos={x:self.x,y:self.y,z:self.z};this.local.team=s.you?.team;
      this.local.mv.x=self.x;this.local.mv.y=self.y;this.local.mv.z=self.z;
      this.local.mv.heli=!!self.air && !!s.you?.heli;this.local.mv.air=!!self.air;
      const gun=this.local.ws?.guns?.[this.local.ws.slot];this.local.weapon=WEAPONS[gun?.id]||WEAPONS.fists;
    }
    const old=new Map(this.remotes.list.map(r=>[r.id,r]));
    this.remotes.list=pl.filter(p=>p.id!==this.net.id).map(p=>{
      const prev=old.get(p.id),buf=(prev?.buf||[]).slice(-28);
      buf.push({t:s.t,x:p.x,y:p.y,z:p.z});
      return {id:p.id,pos:{x:p.x,y:p.y,z:p.z},buf,team:p.tm,alive:!!p.al,stance:p.sn,sliding:!!p.sl,
        lean:p.ln,yaw:p.yaw,invisible:!!p.iv,data:{...p,aim:p.aim,w:p.w,ln:p.ln,pitch:p.pitch}};
    });
    const zold=new Map(this.zremotes.list.map(r=>[r.id,r]));
    this.zremotes.list=(s.zm||[]).map(z=>{const old=zold.get(z.id),buf=(old?.buf||[]).slice(-28);
      buf.push({t:s.t,x:z.x,y:z.y,z:z.z});return {id:z.id,pos:{x:z.x,y:z.y,z:z.z},buf,team:1,alive:true,
        stance:0,sliding:false,yaw:z.yaw,lean:0,data:{hp:z.hp,w:'fists'}};});
  }
  onFire(){} onHit(){} onDmg(){} onKill(){} onShot(){}
  onEnts(d){this.loot.data={crates:(d?.c||[]).map(v=>({id:v[0],x:v[1],y:v[2],z:v[3],yaw:v[4],open:!!v[5],rar:v[6]})),
    items:(d?.i||[]).map(v=>({id:v[0],kind:v[1],wid:v[2],x:v[3],y:v[4],z:v[5],rar:v[6],reserve:v[7]}))};}
  stop(){this.running=false;}
  start(){this.running=true;}
}
