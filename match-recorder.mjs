// Privacy-conscious, opt-in game telemetry (NOT screen or audio recording).
// One compact observation every 500 ms plus gameplay/decision edge events.
const r2=n=>Number.isFinite(n)?Math.round(n*100)/100:null;
const vec=p=>p && [r2(p.x),r2(p.y),r2(p.z)];
export function matchSample(game,input,target,decision={},now=0){
  const ws=game?.local?.ws, mv=game?.local?.mv;
  return {t:r2(now),p:vec(mv),dir:[r2(game?.rig?.yaw),r2(game?.rig?.pitch)],
    hp:r2(game?.local?.hp),armor:r2(game?.local?.armor),alive:!!game?.local?.alive,
    ws:ws?{slot:ws.slot,reloading:!!ws.reloading,guns:(ws.guns||[]).map(g=>({id:g.id,mag:g.mag,reserve:g.reserve}))}:null,
    skill:game?.you?.sk?{id:String(game.you.sk.id||'').slice(0,24),energy:r2(game.you.sk.e),active:r2(game.you.sk.a)}:null,
    actions:input?{fire:!!input.fire,aim:!!input.aim,reload:!!input.reload,skill:!!input.skill,slot:input.slot,
      use:!!input.use,plate:!!input.plate,crouch:!!input.crouch,slide:!!input.slide,
      forward:!!input.forward,backward:!!input.backward,left:!!input.left,right:!!input.right}:null,
    target:target?{id:String(target.id||'').slice(0,64),pos:vec(target.point),visible:!!target.visible}:null,
    decision:{reason:String(decision.reason||'').slice(0,72),loot:String(decision.loot||'').slice(0,72),
      dodge:!!decision.dodge,ring:!!decision.ring,weaponScore:r2(decision.weaponScore),skill:decision.skill?String(decision.skill).slice(0,24):null},
    enemies:(game?.remotes?.list||[]).filter(r=>r?.alive&&r.pos).slice(0,16)
      .map(r=>({id:String(r.id).slice(0,64),pos:vec(r.pos),yaw:r2(r.yaw),pitch:r2(r.pitch),weapon:r.data?.w||null})),
    zombies:(game?.zremotes?.list||[]).filter(r=>r?.alive&&r.pos).slice(0,28).map(r=>vec(r.pos)),
    crates:(game?.loot?.data?.crates||[]).filter(c=>!c.open).slice(0,24).map(c=>({id:c.id,pos:vec(c)})),
    ring:game?.modeState?.type==='br'&&game.modeState?.ring
      ?{cx:r2(game.modeState.ring.cx),cz:r2(game.modeState.ring.cz),r:r2(game.modeState.ring.r),
        phase:String(game.modeState.ring.phase||''),nextSeconds:r2(game.modeState.ring.next),
        next:game.modeState.ring.nxt&&typeof game.modeState.ring.nxt==='object'
          ?{cx:r2(game.modeState.ring.nxt.cx),cz:r2(game.modeState.ring.nxt.cz),r:r2(game.modeState.ring.nxt.r)}:null}:null};
}
export function safeMatchMeta(game){
  return {matchId:String(game?.matchId||'unknown').slice(0,72),
    mode:String(game?.modeState?.type||'unknown').slice(0,32),
    map:String(game?.map?.id||game?.map?.name||'unknown').slice(0,64),
    format:'fpsarena-match-telemetry-v1'};
}
