import {autoFireInput} from './combat-core.mjs';
// Game input.slot accepts -1, 0, 1. A pressed human hotkey is an edge,
// never a held switch request: continuous toggling would disrupt reloads.
export function alternateWeaponSlot(ws){
  if(!ws || !Array.isArray(ws.guns) || ws.guns.length<2 || ws.plateT>0 || ws.switchT>0)return -1;
  const to=ws.slot===0?1:0;
  const next=ws.guns[to];
  return next && next.id && next.id!=='fists' ? to:-1;
}
// Final veto/restore gate after cover, ADS, resource and utility arbitration.
// A camera peek may drop fire on an earlier tick even though the new pose has
// a legitimate hitbox-aligned shot. Do not override actual safety/actions.
export function restoreActionableFire(game,input,target,helpers,options,{ringUrgent=false,dodgeSprint=false,weaponless=false,unready=false}={},adsMemo=null,now=0){
  if(!input||input.fire || ringUrgent || dodgeSprint || weaponless || unready ||
     input.reload || input.plate || input.throw || input.use || input.interact ||
     input.slot===0 || input.slot===1 || !target?.visible || !target.hitboxVisible)return input;
  const ws=game?.local?.ws;
  if(!ws||ws.reloading||ws.plateT>0||ws.switchT>0)return input;
  const shot=autoFireInput(game,{...input,fire:false},target,helpers,options,adsMemo,now);
  // A scoped weapon must be allowed to raise ADS before its first shot. The
  // previous peek override could leave ADS permanently below the ready level.
  return shot.fire||shot.aim ? {...input,fire:!!shot.fire,aim:!!shot.aim} : input;
}
