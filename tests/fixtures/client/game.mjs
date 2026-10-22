import {CameraRig} from './camera.mjs';
export class Game {
  constructor(){this.rig=new CameraRig();this.running=true;this.pos={x:0,y:0,z:0};this.map={boxes:[]};this.net={id:'me'};this.modeState={type:'tdm'};this.phase='match';this.input={locked:true,enabled:true,aimHeld:true,sample:()=>({forward:true,backward:false,left:false,right:false,fire:true})};this.local={alive:true,team:'red',ws:{},mv:{lean:0,x:0,y:0,z:0}};this.remotes={list:[{id:'enemy',pos:{x:1.5,y:0,z:-15},team:1,alive:true,invisible:false,stance:0,yaw:0,sliding:false,data:{}}]};this.zremotes={list:[]};this.bremotes={list:[]};}
  frame(dt,active,paused){this.rig.look(0,0,.01);}
  onSnap(s){this.snapshot=s;}
  onFire(){this.rig.yaw+=.1;this.rig.pitch+=.2;this.recoilPool=(this.recoilPool||0)+.12;}
  simTick(){this.sampled=this.input.sample();}
}
