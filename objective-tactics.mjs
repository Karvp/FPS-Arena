// Public-objective planner for the same S&D / Hardpoint states received by clients.
// This module does NOT read authoritative enemy positions, bomb ownership secrets,
// or simulation-only state. It supplies ordinary movement + F input to the game.
const objectiveDistance=(a,b)=>Math.hypot((a.x||0)-(b.x||0),(a.z||0)-(b.z||0));
export function choosePublicObjective(game, memory={}) {
  const state=game?.modeState, self=game?.local?.mv;
  if(!self || !state || !['snd','hp'].includes(state.type))return null;
  if(state.type==='hp') {
    const zone=state.zone;
    if(!zone || !Number.isFinite(zone.x) || !Number.isFinite(zone.z))return null;
    return {kind:'capture',id:`hp:${zone.id||''}`,goal:{x:zone.x,z:zone.z,y:0},radius:Math.min(5,Math.max(3,Number(zone.r)||6)-1),interact:false};
  }
  if(state.phase!=='active' && state.phase!=='planted')return null;
  const bomb=state.bomb||{},team=game.local?.team,attackers=state.attackers;
  const amAttacker=String(team)===String(attackers);
  if(state.phase==='planted' && Number.isFinite(bomb.x) && Number.isFinite(bomb.z)){
    return {kind:amAttacker?'guard-bomb':'defuse',id:'bomb:'+String(bomb.site||''),
      goal:{x:bomb.x,z:bomb.z,y:0},radius:amAttacker?4.2:2.35,interact:!amAttacker};
  }
  if(amAttacker && bomb.state==='dropped' && Number.isFinite(bomb.x) && Number.isFinite(bomb.z)){
    return {kind:'recover-bomb',id:'bomb:dropped',goal:{x:bomb.x,z:bomb.z,y:0},radius:1.1,interact:false};
  }
  const sites=Array.isArray(state.sites)?state.sites.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.z)):[];
  if(!sites.length)return null;
  const preserved=sites.find(s=>String(s.id)===String(memory.siteId));
  // Stick to one target site so round-to-round movement is not indecisive.
  const site=preserved||[...sites].sort((a,b)=>objectiveDistance(self,a)-objectiveDistance(self,b))[0];
  const carrying=amAttacker&&bomb.state==='carried'&&String(bomb.pid)===String(game.net?.id);
  return {kind:carrying?'plant':amAttacker?'escort':'defend-site',id:`site:${site.id}`,siteId:site.id,
    goal:{x:site.x,z:site.z,y:0},radius:carrying?3.5:5.0,interact:carrying};
}
export function objectiveRoutePlan(game,helpers,now,memory={},target=null,planners={}){
  const routeFn=planners.route||(typeof gridRoute==='function'?gridRoute:null);
  const clear=planners.clear||(typeof safeDirection==='function'?safeDirection:null);
  const goal=choosePublicObjective(game,memory);
  if(!goal)return null;
  const mv=game.local.mv,dist=objectiveDistance(mv,goal.goal);
  const closeThreat=target?.visible && Number.isFinite(target?.distance) && target.distance<19;
  // Defending a point and actively planting/defusing are not compatible with
  // running out into visible contact; let the combat system resolve the fight.
  if(closeThreat && !(goal.kind==='capture' && dist>12))return null;
  if(goal.siteId!==undefined)memory.siteId=goal.siteId;
  if(dist<=goal.radius){
    return {...goal,distance:dist,direction:null,hold:true,interact:goal.interact};
  }
  const cached=memory.route;
  if(!cached || cached.id!==goal.id ||
     !Number.isFinite(cached.goal?.x) || !Number.isFinite(cached.goal?.z) ||
     objectiveDistance(cached.goal,goal.goal)>2 || now-cached.updated>1.7 ||
     (!cached.path?.length && now-cached.updated>.9)){
    memory.route={id:goal.id,goal:goal.goal,updated:now,
      path:routeFn?routeFn(game.map,mv,goal.goal,{maxExpanded:5400}):null};
  }
  const route=memory.route;
  while(route.path?.length && objectiveDistance(mv,route.path[0])<1.35)route.path.shift();
  const wp=route.path?.[0]||goal.goal;
  const dx=wp.x-mv.x,dz=wp.z-mv.z;
  if(!clear || !clear(game,dx,dz,helpers,1.05))return null;
  return {...goal,distance:dist,direction:{x:dx,z:dz,reason:'mode-objective-'+goal.kind,
    goal:goal.goal,sprint:dist>16},hold:false,interact:false};
}
