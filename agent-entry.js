// This file is concatenated after aim-core.mjs by scripts/build.mjs.
// It runs as an inline ES module in the FPS Arena page world.
(async () => {
  const emit = (event, payload) => document.dispatchEvent(new CustomEvent(`fpsarena-aim:${event}`, { detail: JSON.stringify(payload) }));
  const postStatus = (state, message, tracking = false) => emit('status', { state, message, tracking });
  try {
    if (window.__FPSARENA_AIM_INSTALLED__) { postStatus('ready', 'Already installed'); return; }
    // Imports resolve against the game's origin; their prototypes match main.js.
    // Supports the 2026-10-09 build with scorestreak and vehicle cameras.
    const [{ Game }, { CameraRig }, constants, geometry, movement, skills, weapons, rarity] = await Promise.all([
      import('/client/game.js'), import('/client/camera.js'), import('/shared/constants.js'),
      import('/shared/geometry.js'), import('/shared/movement.js'), import('/shared/skills.js'),
      import('/shared/weapons.js'),import('/shared/rarity.js'),
    ]);
    if (!Game?.prototype?.frame || !Game?.prototype?.simTick || !Game?.prototype?.onSnap ||
        !CameraRig?.prototype?.look) throw new Error('Unsupported FPS Arena build');
    window.__FPSARENA_AIM_INSTALLED__ = true;
    let options = normaliseOptions(DEFAULTS);
    let heldKeys = new Set(), lastTargetId = null, lastSent = '', lastEmit = 0;
    let activeGame = null, activeDt = 0, active = false, currentTarget = null;
    let manualWeaponSwapRequestedAt=-Infinity;
    const motionMemory=new WeakMap(),macroMemory=new WeakMap(),macroCombatMemory=new WeakMap(),macroVantageMemory=new WeakMap(),macroOwnerMemory=new WeakMap(),macroOptionMemory=new WeakMap(),goalAwareMemory=new WeakMap(),tacticalDirectorMemory=new WeakMap(),macroCoverMemory=new WeakMap(),adsPostureMemory=new WeakMap();
    const projectileObservations = new WeakMap(), predictiveEvasionMemory=new WeakMap(), dodgeMemory = new WeakMap(), tacticalMemory=new WeakMap(), navigationMemory=new WeakMap(), precisionRouteMemory=new WeakMap(), combatMemory=new WeakMap(), proMovementMemory=new WeakMap(),stanceMemory=new WeakMap(),lootMemory=new WeakMap(),ringMemory=new WeakMap(),resourceMemory=new WeakMap(),zombieRouteMemory=new WeakMap(),shotIntel=new WeakMap(),coverRouteMemory=new WeakMap(),cameraTacticsMemory=new WeakMap();
    // Match Recorder: deliberately disabled until the user checks the popup toggle.
    let recordGame=null, recordMatchId=null, recordStartedAt=0, recordSampleAt=-Infinity;
    const faultMemory=new WeakMap(); let lastModeKey=null,faultEpoch=0;
    const brInsertionMemory=new WeakMap(),squadMemory=new WeakMap(),objectiveMemory=new WeakMap(),skillMemory=new WeakMap(),recoveryMemory=new WeakMap(),respawnMemory=new WeakMap(),throwableMemory=new WeakMap();
    let lastRecordedAction=null, lastRecordedFire=-Infinity;
    const recordEmit=(kind,payload={})=>emit('record',{kind,...payload});
    function finishRecording(){
      if(recordMatchId!==null){recordEmit('end',{matchId:recordMatchId,at:performance.now()/1000});
        recordMatchId=null;recordGame=null;recordSampleAt=-Infinity;}
    }
    function recordEvent(game,type,data={}){
      if(!options.recordMatches || recordMatchId===null || game!==recordGame)return;
      recordEmit('event',{matchId:recordMatchId,event:{t:Math.round((performance.now()/1000-recordStartedAt)*100)/100,
        type:String(type).slice(0,32),data}});
    }
    function recordTick(game,input=null,decision={}){
      if(!options.recordMatches || !game?.running){finishRecording();return;}
      const now=performance.now()/1000;
      const id=String(game.matchId??'unknown').slice(0,72)+'-'+String(game.modeState?.type||'pending');
      if(recordGame!==game || recordMatchId!==id){finishRecording();recordGame=game;recordMatchId=id;
        recordStartedAt=now;recordEmit('start',{matchId:id,meta:safeMatchMeta(game),startedAt:Date.now()});}
      if(now-recordSampleAt<.5)return;
      recordSampleAt=now;
      const sample=matchSample(game,input,currentTarget,decision,now-recordStartedAt);
      recordEmit('sample',{matchId:id,sample});
    }
    const espItems = new Map();
    let espRoot = null, dodgeActive = false, tacticalActive = false;
    let radarCanvas = null, radarContext = null, lastRadarDraw=0;
    const weaponCatalog=Object.fromEntries(Object.entries(weapons.WEAPONS).map(([id,w])=>[id,{...w,rarity:rarity.rarityOf(id)}]));
    const helpers = {
      rayWorld: geometry.rayWorld, eyeHeightOf: movement.eyeHeightOf,
      player: constants.PLAYER, leanOffset: constants.LEAN.offset,
      raySphere: geometry.raySphere,rayAABB:geometry.rayAABB,
    };
    const root = document.createElement('div');
    root.id = 'fpsarena-aim-ui'; root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;display:none;font-family:system-ui,sans-serif';
    const ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:1px solid rgba(97,226,255,.46);border-radius:50%;box-shadow:0 0 18px rgba(97,226,255,.07);box-sizing:border-box;';
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:50%;transform:translate(-50%,-50%);background:rgba(97,226,255,.9);box-shadow:0 0 10px rgba(97,226,255,.5);';
    const tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;top:18px;right:16px;color:#e7f8ff;background:rgba(6,17,27,.78);border:1px solid rgba(94,220,255,.4);border-radius:8px;padding:5px 9px;font-size:11px;letter-spacing:.12em;font-weight:750';
    root.append(ring, dot, tag); document.body.append(root);
    espRoot = document.createElement('div');
    espRoot.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    root.append(espRoot);
    radarCanvas = document.createElement('canvas');
    radarCanvas.width=188;radarCanvas.height=188;
    radarCanvas.style.cssText='position:absolute;right:16px;bottom:20px;width:188px;height:188px;pointer-events:none;display:none;';
    root.append(radarCanvas);
    radarContext = radarCanvas.getContext?.('2d') || null;
    const grenadeHUD=document.createElement('div');
    grenadeHUD.style.cssText='position:absolute;left:50%;bottom:15%;transform:translateX(-50%);font:700 12px system-ui;color:#aaffea;text-shadow:0 1px 5px black;background:#112632c9;border-radius:5px;padding:6px 12px;display:none';
    root.append(grenadeHUD);
    function updateRadar(game) {
      if (!radarContext || !options.radar || !avatarControllable(game)) {
        radarCanvas.style.display='none';return;
      }
      radarCanvas.style.display='';
      if(performance.now()-lastRadarDraw<80)return;
      lastRadarDraw=performance.now();
      const ctx=radarContext,cx=94,cy=94, radius=84, range=options.radarRange;
      ctx.clearRect(0,0,188,188);
      ctx.fillStyle='rgba(7,17,29,.86)';ctx.beginPath();ctx.arc(cx,cy,92,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(130,214,239,.35)';
      for(const r of [27,55,84]){ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.stroke();}
      ctx.fillStyle='#9be1f7';ctx.font='10px sans-serif';ctx.fillText('360° RADAR',67,13);
      ctx.fillStyle='#69f6e2';ctx.beginPath();ctx.moveTo(cx,cy-7);ctx.lineTo(cx-4,cy+4);ctx.lineTo(cx+4,cy+4);ctx.fill();
      for(const c of radarContacts(game,range)) {
        const d=Math.max(5,Math.min(radius,c.range/range*radius)), x=cx+Math.sin(c.angle)*d,y=cy-Math.cos(c.angle)*d;
        ctx.beginPath();ctx.fillStyle=c.aiming?'#ffb74d':'#ff5a7a';ctx.arc(x,y,c.aiming?4.3:3.2,0,Math.PI*2);ctx.fill();
      }
    }
    function hideEsp() { for (const el of espItems.values()) el.style.display = 'none'; }
    function updateEsp(game) {
      if (!options.esp || !avatarControllable(game) || !game.rig?.camera) { hideEsp(); return; }
      const camera = game.rig.camera;
      if (!camera.matrixWorldInverse || !camera.projectionMatrix) { hideEsp(); return; }
      if (typeof camera.updateWorldMatrix === 'function') camera.updateWorldMatrix(true,false);
      else camera.updateMatrixWorld?.(true);
      const activeIds = new Set();
      const eye = [game.pos.x, game.pos.y + helpers.eyeHeightOf(game.local.mv), game.pos.z];
      for (const {id, remote:r} of opponents(game)) {
        if (activeIds.size >= 36 || !r.pos) continue;
        const dist = Math.hypot(r.pos.x - game.pos.x, r.pos.y - game.pos.y, r.pos.z - game.pos.z);
        if (dist > options.espDistance) continue;
        const foot = projectToScreen(r.pos, camera, innerWidth, innerHeight);
        const headY = r.sliding ? constants.PLAYER.slideHeadY : constants.PLAYER.headYs[r.stance || 0];
        const headPoint=getAimPoint(r,'head',constants.PLAYER,estimateRemoteLean(game,r,0),constants.LEAN.offset);
        const head = projectToScreen({...headPoint,y:headPoint.y+.18}, camera, innerWidth, innerHeight);
        if (!foot || !head || (!foot.inside && !head.inside)) continue;
        const h = Math.max(8,Math.abs(foot.y - head.y)), w = Math.max(7,h*.44);
        if (h > innerHeight * 5) continue;
        let el = espItems.get(id);
        if (!el) {
          el = document.createElement('div');
          el.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #ff655b;background:rgba(255,100,70,.045);border-radius:3px;box-shadow:0 0 9px #f64b3a66, inset 0 0 8px #ff554422;pointer-events:none;';
          const name = document.createElement('span');
          name.style.cssText = 'position:absolute;bottom:100%;left:50%;transform:translateX(-50%);white-space:nowrap;color:white;font-size:11px;font-weight:750;text-shadow:0 1px 4px black;background:#1d0d16be;border-radius:4px;padding:2px 5px;';
          el.append(name); el.__label = name;
          espRoot.append(el); espItems.set(id,el);
        }
        activeIds.add(id); el.style.display = '';
        el.style.left = `${(head.x + foot.x)*.5 - w*.5}px`;
        el.style.top = `${Math.min(head.y, foot.y)}px`;
        el.style.width = `${w}px`; el.style.height = `${h}px`;
        const rayDir = [r.pos.x-eye[0],r.pos.y+headY*.6-eye[1],r.pos.z-eye[2]];
        const len = Math.hypot(...rayDir);
        const blocked = len > .1 && helpers.rayWorld(eye,rayDir.map(v=>v/len),game.map.boxes,len) < len - .1;
        el.style.borderColor = blocked ? '#f25372' : '#66fbe0';
        const rawName = game.names?.get?.(r.id) || `${id}`;
        el.__label.textContent = options.espNames ? `${rawName} · ${Math.round(dist)}m${blocked ? ' · WALL' : ''}` : `${Math.round(dist)}m`;
      }
      for (const [id, el] of espItems) if (!activeIds.has(id)) {
        el.remove(); espItems.delete(id);
      }
    }
    // Only projectiles provided by the server are tracked. Hitscan weapons have no flight state.
    if (typeof Game.prototype.onSnap === 'function') {
      const originalSnap = Game.prototype.onSnap;
      Game.prototype.onSnap = function(s) {
        const now = performance.now() / 1000;
        const previous = projectileObservations.get(this) || new Map();
        const next = new Map();
        for (const p of s?.pj || []) {
          if (!Array.isArray(p) || p.length < 10) continue;
          const older = previous.get(p[0]);
          const dt = older ? now - older.time : 0;
          const vel = dt > .01 && dt < .5 ? {vx:(p[2]-older.x)/dt, vz:(p[4]-older.z)/dt} : {vx:0,vz:0};
          next.set(p[0], {x:p[2], y:p[3], z:p[4], kind:skills.THROW_LIST[p[1]], stuck:!!p[5],fuse: Math.max(-1,(skills.THROWABLES[skills.THROW_LIST[p[1]]]?.fuse ?? 0) - (p[11] || 0)),time:now, ...vel});
        }
        projectileObservations.set(this,next);
        observeLeanSnapshot(this,s);
        const response=originalSnap.apply(this,arguments);
        // Detect mode/round transitions even when not yet controllable (Zombies).
        if(options.recordMatches)try{recordTick(this,null,{reason:'server-snapshot'});}catch(_){}
        return response;
      };
    }
    if(typeof Game.prototype.stop==='function'){
      const originalStop=Game.prototype.stop;
      Game.prototype.stop=function(...args){if(recordGame===this)finishRecording();return originalStop.apply(this,args);};
      if(typeof Game.prototype.start==='function'){
        const originalStart=Game.prototype.start;
        Game.prototype.start=function(...args){
          // A fresh match can reuse the same Game object. Discard stale routes.
          for(const mem of [dodgeMemory,tacticalMemory,navigationMemory,precisionRouteMemory,
            combatMemory,proMovementMemory,stanceMemory,lootMemory,ringMemory,resourceMemory,
            zombieRouteMemory,coverRouteMemory,cameraTacticsMemory,motionMemory,macroMemory,macroCombatMemory,macroVantageMemory,macroOwnerMemory,macroOptionMemory,goalAwareMemory,tacticalDirectorMemory,macroCoverMemory,adsPostureMemory,squadMemory,objectiveMemory,brInsertionMemory,skillMemory,recoveryMemory,respawnMemory,throwableMemory,faultMemory])mem.delete(this);
          lastTargetId=null;currentTarget=null;
          return originalStart.apply(this,args);
        };
      }
    }
    for(const method of ['onHit','onDmg','onKill','onEnts']){
      if(typeof Game.prototype[method]!=='function')continue;
      const original=Game.prototype[method];
      Game.prototype[method]=function(data,...args){
        if(method==='onHit')recordEvent(this,'hit',{kind:String(data?.kind||'hit').slice(0,32)});
        else if(method==='onDmg')recordEvent(this,'damage',{hp:data?.h??null,armor:data?.a??null});
        else if(method==='onKill')recordEvent(this,'kill',{id:String(data?.id||data?.v||'').slice(0,64)});
        else recordEvent(this,'loot-update',{items:data?.i?.length??null,crates:data?.c?.length??null});
        return original.call(this,data,...args);
      };
    }
    // Observe actual opponent shot events. The snapshot does not reveal opponent
    // magazines or reserves: fire pressure is always treated as uncertain.
    if (typeof Game.prototype.onShot === 'function') {
      const originalShot = Game.prototype.onShot;
      Game.prototype.onShot = function(event) {
        if(event?.id && event.id!==this.net?.id){
          let memo=shotIntel.get(this);
          if(!memo){memo=new Map();shotIntel.set(this,memo);}
          observeEnemyShot(memo,event,performance.now()/1000,weaponCatalog);
          recordEvent(this,'enemy-shot',{weapon:String(event?.w||'').slice(0,48),id:String(event.id).slice(0,64)});
        }
        return originalShot.apply(this,arguments);
      };
    }
    // A single input arbitration layer combines evasion, navigation, trigger, and resource control.
    // Priority: user input unless explicitly enabled; evasion overrides tactical direction.
    if (typeof Game.prototype.simTick === 'function') {
      const originalTick = Game.prototype.simTick;
      Game.prototype.simTick = function(...args) {
        const valid = avatarControllable(this);
        if (!valid) {
          // BR insertion is a regular player action: leave the helicopter and
          // steer the glider toward reachable loot or the active ring. The
          // server still enforces the jump, fall, landing, and damage rules.
          const mv=this.local?.mv;
          const insertion=options.enabled && options.mode==='autopilot' &&
            this.phase==='match' && this.modeState?.type==='br' && (mv?.heli || mv?.air);
          let restoreSample=null,wasOwn=false;
          if(insertion && typeof this.input?.sample==='function') {
            const sample=this.input.sample, game=this;
            wasOwn=Object.hasOwn(this.input,'sample');restoreSample=sample;
            let mem=brInsertionMemory.get(this);
            const now=performance.now()/1000;
            if(!mem||now<mem.started) {mem={started:now};brInsertionMemory.set(this,mem);}
            this.input.sample=function(...sampleArgs){
              const s={...sample.apply(this,sampleArgs)};
              if(mv.heli) {
                // The server's heli jump is edge-triggered and locked for 0.7s.
                const since=now-mem.started;
                s.jump=since>1.0 && Math.floor((since-1)*3)%2===0;
                s.use=false;
                return s;
              }
              const crates=(game.loot?.data?.crates||[]).filter(c=>!c.open);
              const ring=game.modeState?.ring;
              const safe=c=>!ring||Math.hypot(c.x-ring.cx,c.z-ring.cz)<ring.r-5;
              let goal=null,best=Infinity;
              for(const c of crates){if(!safe(c))continue;
                const d=Math.hypot(c.x-mv.x,c.z-mv.z);
                if(d<best){best=d;goal=c;}
              }
              if(!goal)goal=ring&&Number.isFinite(ring.cx)?{x:ring.cx,z:ring.cz,y:0}:{x:0,z:0,y:0};
              const dx=goal.x-mv.x,dz=goal.z-mv.z;
              const d=Math.hypot(dx,dz),height=Math.max(1,mv.y-(goal.y||0));
              const need=d/16,fall=height/15;
              game.rig.yaw=Math.atan2(-dx,-dz);game.rig.pitch=0;
              s.forward=d>1.5;s.backward=false;s.left=false;s.right=false;
              s.slide=need>fall*1.02;s.jump=!s.slide&&need<fall*.45&&d<40&&height>12;
              return s;
            };
          }
          try{
            const ret=originalTick.apply(this,args);
            try {recordTick(this,null,{reason:insertion?'br-insertion':'spectating-or-down'});} catch (_) {}
            return ret;
          }finally{
            if(restoreSample){if(wasOwn)this.input.sample=restoreSample;else delete this.input.sample;}
          }
        }
        const originalSample = this.input.sample;
        if (typeof originalSample !== 'function') return originalTick.apply(this,args);
        const game = this, hadOwn = Object.hasOwn(game.input,'sample');
        game.input.sample = function(...sampleArgs) {
          // Always sample the original input first. Extension failures must
          // never interrupt Game.simTick() or consume the player's input.
          const baseline=originalSample.apply(this,sampleArgs);
          let s=baseline;
          // Human-only weapon keybind is independent of the aimbot toggle.
          // A stale keypress is never replayed after respawn or a delayed cooldown.
          if(options.mode!=='autopilot' && performance.now()/1000-manualWeaponSwapRequestedAt<.22){
            const selected=alternateWeaponSlot(game.local?.ws);
            if(selected>=0)s={...s,slot:selected};
            manualWeaponSwapRequestedAt=-Infinity;
          }
          // Autopilot owns movement while active; stale physical keys may not leak in.
          if(options.enabled&&options.mode==='autopilot')s={...baseline,forward:false,backward:false,left:false,right:false};
          try {
          const now=performance.now()/1000;
          const priorFault=faultMemory.get(game);
          if(priorFault?.epoch===faultEpoch && now<priorFault.retryAt)return s;
          const autonomous = options.enabled && options.mode==='autopilot';
          const modeKey=String(game.matchId??'')+':'+String(game.modeState?.type||'');
          if(lastModeKey!==modeKey){lastModeKey=modeKey;lastTargetId=null;currentTarget=null;
            for(const mem of [dodgeMemory,tacticalMemory,navigationMemory,precisionRouteMemory,
              combatMemory,proMovementMemory,stanceMemory,lootMemory,ringMemory,resourceMemory,
              zombieRouteMemory,coverRouteMemory,cameraTacticsMemory,motionMemory,macroMemory,macroCombatMemory,macroVantageMemory,macroOwnerMemory,macroOptionMemory,goalAwareMemory,tacticalDirectorMemory,macroCoverMemory,adsPostureMemory,squadMemory,objectiveMemory,brInsertionMemory,skillMemory,recoveryMemory,respawnMemory,throwableMemory,faultMemory])mem.delete(game);
          }
          const loadout=weaponLootState(game,weaponCatalog);
          const weaponless=autonomous && ['br','zm'].includes(game.modeState?.type) && (loadout.needsWeapon || loadout.needsAmmo);
          const unready=autonomous && loadout.switchSlot>=0;
          const ringPlan=autonomous ? ringSafetyPlan(game,options) : null;
          let rotatingRing=!!ringPlan;
          const escapingRing=!!ringPlan?.urgent;
          // SimTick samples inputs at 60Hz, even if render frames are slower.
          // Reacquire on this exact tick so fire/yaw never rely on stale camera targets.
          if(autonomous && !weaponless && !unready && !escapingRing && options.fastAim!==false){
            const acquired=acquireCombatTarget(game,options,helpers,lastTargetId);
            currentTarget=acquired;lastTargetId=acquired?.id||null;
            if(acquired?.visible){
              // Glider snapshots arrive at 30 Hz. Follow their latest predicted
              // trajectory with a tiny damped step to avoid a visible 30 Hz
              // camera twitch, without delaying grounded headshot alignment.
              if(game.modeState?.type==='br' && acquired.remote?.data?.air){
                const next=aimStep(game.rig.yaw,game.rig.pitch,acquired,1/60,10,constants.PITCH_MAX);
                game.rig.yaw=next.yaw;game.rig.pitch=next.pitch;
              }else{game.rig.yaw=acquired.yaw;game.rig.pitch=acquired.pitch;}
            }
          }
          // Do not couple hidden navigation-target choice to the yaw-sensitive
          // shooting target. A new visible opponent always overrides instantly.
          if(autonomous && (options.macroRoutingLab===true || options.macroTargetLab===true || (options.macroTargetCommitment!==false && game.modeState?.type==='tdm')) && currentTarget && !currentTarget.visible){
            const memo=macroMemory.get(game)||{};macroMemory.set(game,memo);
            const publicRemotes=[...(game.remotes?.list||[]).map(r=>({...r,kind:'p'})),
              ...(game.bremotes?.list||[]).map(r=>({...r,kind:'b'}))];
            currentTarget=macroChooseHiddenGoal(currentTarget,publicRemotes,
              game.local.mv,now,memo,{maxDistance:options.maxDistance});
          }
          const previousCombat=combatMemory.get(game)||{};
          let combatState=updateCombatMemory(game,s,now,helpers,currentTarget,previousCombat);
          combatMemory.set(game,combatState);
          // Live evaluation changes spacing/weapon archetype tactics only; the
          // primary-first safety policy in manageResources remains unchanged.
          const livePolicy=autonomous && options.weaponTactics!==false
            ? liveWeaponPolicy(game,currentTarget,combatState.risk,weaponCatalog,options):null;
          const liveOptions=livePolicy?{...options,dynamicWeaponPolicy:livePolicy}:options;
          let direction = null, lootPlan=null;
          // Safety-first loot: disabled while under player fire or in the zombie melee buffer.
          if(autonomous && (!ringPlan || !ringPlan.urgent) && (options.autoLoot || weaponless)){
            const previousLoot=lootMemory.get(game)||{};
            lootPlan=planLoot(game,combatState.risk,options,helpers,weaponCatalog,rarity.ammoClassOf,previousLoot,now);
            lootMemory.set(game,lootPlan ? {...previousLoot,targetId:lootPlan.targetId,
              lastUse:lootPlan.interact && lootPlan.use ? now : previousLoot.lastUse} : previousLoot);
          }
          // Permit only an affordable complete loot excursion while pre-rotating.
          if(autonomous && ringPlan && !ringPlan.urgent && lootPlan &&
             brLootTimeBudget(game,options,lootPlan.goal ||
               (game.loot?.data?.items||[]).concat(game.loot?.data?.crates||[])
                 .find(v=>String(lootPlan.targetId).endsWith(':'+v.id)) || game.local.mv).allowed)
            rotatingRing=false;
          if(rotatingRing)lootPlan=null;
          dodgeActive=false; // Per-tick state: never keep an expired dodge active.
          const imminentExplosive=Array.from(projectileObservations.get(game)?.values()||[])
            .some(p=>p?.stuck && p.fuse>=0 && p.fuse<1.3 && Math.hypot(p.x-game.pos.x,p.z-game.pos.z)<9);
          // Outrunning the closing BR ring has precedence over tactical dodges,
          // combat posture, weapon repair and opportunistic loot.
          if(options.enabled && options.dodge && !rotatingRing && (!weaponless || imminentExplosive)) {
            const prior=dodgeMemory.get(game)||null;
            const projectiles=Array.from(projectileObservations.get(game)?.values()||[]);
            const contacts=collectThreatIntel(game,options.enemyAmmoAwareness!==false ? shotIntel.get(game) : null,now,weaponCatalog)
              .filter(e=>Math.hypot(e.x-game.local.mv.x,e.z-game.local.mv.z) < Math.max(70,options.dodgeRange,Math.min(410,e.maxRange||0)));
            // Use a cached risk-weighted route if pressure is observable. Local
            // dodge remains as a fallback when there is no navigable corridor.
            const routeMemory=coverRouteMemory.get(game)||{};
            if(!coverRouteMemory.has(game))coverRouteMemory.set(game,routeMemory);
            const urgent=projectiles.some(p=>p.stuck && p.fuse>=0 && p.fuse<1.2 &&
              Math.hypot(p.x-game.pos.x,p.z-game.pos.z)<10);
            let pressure=false;
            for(const c of contacts){
              const dd=Math.hypot(c.x-game.pos.x,c.z-game.pos.z);
              const ux=(game.pos.x-c.x)/Math.max(.01,dd),uz=(game.pos.z-c.z)/Math.max(.01,dd);
              const facing=-Math.sin(c.yaw)*ux-Math.cos(c.yaw)*uz;
              // React to the observed gun's actual hitscan reach, not the
              // 45–85 m short-dodge UI radius. Long-range pressure still
              // requires a plausible aiming/firing cone to avoid panic loops.
              const longLane=dd<=Math.min(410,c.maxRange||0) && dd>options.dodgeRange &&
                (c.aim&&facing>.83 || c.recentFire&&facing>.70);
              if(((dd<options.dodgeRange && (c.aim&&facing>.78 || options.preemptiveCover===true && facing>.12 || options.combatCoverPressure && game.modeState?.type==='tdm' && c.recentFire && facing>.28 || dd<13)) || longLane) &&
                !cameraOccluded(game.map,{x:c.x,y:(c.y||0)+1.5,z:c.z},
                  {x:game.pos.x,y:game.local.mv.y+1.15,z:game.pos.z})){
                pressure=true;break;
              }
            }
            if(pressure && !urgent && autonomous && options.combatDodgeCommit===true &&
               shouldContestSightline(game,currentTarget,contacts,combatState,now))pressure=false;
            direction=(autonomous && options.smartCover!==false && (pressure||urgent))
              ?planTacticalEscape(game,helpers,contacts,projectiles,now,routeMemory,{urgent}) : null;
            if(!direction && (pressure||urgent||!autonomous))
              direction=predictDodge(game,projectiles,helpers,options,prior?.direction,now);
            // Predict hitscan exposure against official hip-fire AND ADS enemies.
            // The short-horizon steer is client-only; prefer hard-cover routes
            // when they yield a defensible retreat. Explosive urgencies always win.
            if(autonomous && options.predictiveEvasion && !urgent && game.modeState?.type==='tdm'){
              let evasionState=predictiveEvasionMemory.get(game);
              if(!evasionState){evasionState={};predictiveEvasionMemory.set(game,evasionState);}
              const evasion=predictiveEvasion(game,helpers,contacts,now,evasionState,{range:options.dodgeRange});
              if(evasion && (!direction || direction.reason!=='threat-aware-route'))direction=evasion;
            }
            if(autonomous && options.sprintEvasion===true && direction && pressure &&
               (direction.reason==='threat-aware-route' || direction.reason==='predictive-hitscan-evasion')){
              // Make short defensive traversals at full legal ground speed.
              // Aiming continuously while retreating unnecessarily caps speed.
              const immediate=contacts.some(c=>c.recentFire &&
                Math.hypot(c.x-game.pos.x,c.z-game.pos.z)<53);
              if(immediate)direction={...direction,emergency:true,sprint:true,suppressFire:true,breakAds:true};
            }
            dodgeActive=!!direction;
            if(direction){direction={...direction,reason:direction.reason||'dodge-threat',emergency:true,sprint:!!autonomous && (direction.sprint===true || game.local.hp<45 || Array.from(projectileObservations.get(game)?.values()||[]).some(p=>p?.stuck && p.fuse>=0 && p.fuse<1.2 && Math.hypot(p.x-game.pos.x,p.z-game.pos.z)<9))};dodgeMemory.set(game,{direction});}
            else dodgeMemory.delete(game);
          }
          const navigational = options.enabled && (autonomous || options.tactical && isEngaged(game));
          if(rotatingRing) {
            const ringPrior=ringMemory.get(game)||{};
            const direct=battleRoyaleRingEscape(game,helpers,{...options,ringDetourSide:ringPrior.detourSide});
            if(direct?.detourSide && ringPrior.detourSide!==direct.detourSide)
              ringMemory.set(game,{...ringPrior,detourSide:direct.detourSide});
            const mv=game.local.mv;
            let routeState=ringMemory.get(game);
            if(game.map?.boxes?.length &&
                (!routeState || !Number.isFinite(routeState.goal?.x) ||
                  !Number.isFinite(routeState.goal?.z) ||
                  (!routeState.pending && now-routeState.time>(ringPlan.urgent?.65:1.9)) ||
                  Math.hypot(routeState.goal.x-ringPlan.goal.x,routeState.goal.z-ringPlan.goal.z)>3 ||
                  (!routeState.pending && routeState.path?.length===0))) {
              routeState={time:now,goal:ringPlan.goal,detourSide:routeState?.detourSide,
                path:null,pending:true,planner:{}};
              ringMemory.set(game,routeState);
            }
            if(routeState?.pending){
              // Elevated Oil Rig searches advance in small deterministic slices
              // while the existing immediate ring escape steering remains active.
              const ringGoal={...ringPlan.goal};
              if(mv.y>.7 && !walkableSurface(game.map,ringGoal.x,ringGoal.z,ringGoal.y) &&
                 walkableSurface(game.map,ringGoal.x,ringGoal.z,0))ringGoal.y=0;
              const result=gridRouteCooperative(game.map,mv,ringGoal,routeState.planner,{maxExpanded:5000,
                riskWeight:ringPlan.urgent?0:.22,
                threats:collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog),
                projectiles:Array.from(projectileObservations.get(game)?.values()||[])});
              if(result.status!=='pending'){
                routeState.path=result.path;routeState.pending=false;routeState.time=now;
              }
            }
            if(routeState?.path?.length){
              const steer=followRoute3D(game,routeState.path,helpers);
              if(steer && (safeDirection(game,steer.x,steer.z,helpers,1.15) ||
                  routeDirectionSafe(game.map,mv,steer.waypoint)))
                direction={x:steer.x,z:steer.z,reason:'br-ring-path',sprint:true};
            }
            if(!direction)direction=direct;
          }
          // S&D / Hardpoint objectives use only PUBLIC modeState, so the
          // exact same policy runs in the extension and headless arena.
          let modeObjective=null;
          if(autonomous && !direction && !rotatingRing && !weaponless && !unready &&
             (game.modeState?.type==='snd' || game.modeState?.type==='hp')) {
            let mem=objectiveMemory.get(game);
            if(!mem){mem={};objectiveMemory.set(game,mem);}
            modeObjective=objectiveRoutePlan(game,helpers,now,mem,currentTarget);
            if(modeObjective?.direction)direction=modeObjective.direction;
          }
          if(autonomous && game.modeState?.type==='zm' && !direction){
            const near=nearestZombie(game);
            // A weapon pickup can take priority only when nearly in reach.
            // Only imminent contact overrides a *reachable and safe* loot route.
            const criticalRadius=Math.max(11,Math.min(17,(options.zombieSpacing??22)*.62));
            if((near && near.distance<criticalRadius &&
               zombieLootMustEvade(game,lootPlan,near,options)) ||
               (!lootPlan && near && near.distance<criticalRadius)) {
              let state=zombieRouteMemory.get(game);
              if(!state){state={};zombieRouteMemory.set(game,state);}
              direction=planZombieEscape(game,helpers,{...options,escapeGoal:lootPlan?.goal},now,state);
            }
          }
          if(autonomous && lootPlan && !direction && navigational){
            if(lootPlan.direction && (options.pathfinding || game.modeState?.type==='zm')){
              let state=navigationMemory.get(game);
              const mv=game.local.mv;
              // Count meaningful progress toward the route, not merely
              // shuttling 0.55 m back and forth beside the same wall.
              const remaining=pathRemainingDistance(mv,state?.path);
              if(state && state.id===lootPlan.targetId && Number.isFinite(remaining) &&
                 (!Number.isFinite(state.bestRemaining)||remaining<state.bestRemaining-.35)){
                state.bestRemaining=remaining;state.progressAt=now;
              }
              const stalled=state?.id===lootPlan.targetId && now-(state.progressAt??now)>1.35;
              const zombieContacts=game.modeState?.type==='zm'
                ?zombieMotionContacts(game.zremotes?.list||[]):[];
              let pathMeters=0, lastWaypoint=mv;
              const pathUnsafe=game.modeState?.type==='zm' && state?.path?.slice(0,8).some(wp=>{
                pathMeters+=Math.hypot(wp.x-lastWaypoint.x,wp.z-lastWaypoint.z);
                lastWaypoint=wp;
                return zombieInterceptRisk(wp,zombieContacts,pathMeters/6.3)>26;
              });
              // When a pincer closes, recalculate quickly but never at 60 Hz.
              const replanThreat=pathUnsafe && now-(state?.updated??0)>.28;
              if(stalled){
                // Avoid repeatedly insisting on a crate behind an inaccessible
                // corner. Choose another candidate for four seconds.
                const previousLoot=lootMemory.get(game)||{};
                lootMemory.set(game,{...previousLoot,avoidTarget:lootPlan.targetId,avoidUntil:now+4,routeCache:null});
              }
              if(!state || state.id!==lootPlan.targetId ||
                  (!state.pending && now-state.updated>2.0) || stalled || replanThreat){
                const initialPath=(lootPlan.route && !stalled && !replanThreat) ? [...lootPlan.route] : null;
                state={id:lootPlan.targetId,updated:now,goal:lootPlan.goal,
                  progressAt:now,progressX:mv.x,progressZ:mv.z,
                  path:initialPath,pending:!initialPath,planner:{}};
                navigationMemory.set(game,state);
              }
              if(state.pending){
                const result=gridRouteCooperative(game.map,mv,lootPlan.goal,state.planner,{
                  riskWeight:.30,
                  threats:collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog),
                  zombieContacts,
                  zombieRiskWeight:game.modeState?.type==='zm'?.20:0,
                  projectiles:Array.from(projectileObservations.get(game)?.values()||[])});
                if(result.status!=='pending'){
                  state.path=result.path||[];state.pending=false;state.updated=now;
                }
              }
              const steer=followRoute3D(game,state.path,helpers);
              if(steer && (safeDirection(game,steer.x,steer.z,helpers,1.1) ||
                  routeDirectionSafe(game.map,game.local.mv,steer.waypoint)))
                direction={x:steer.x,z:steer.z,reason:'loot-pathfinding'};
            }
            if(!direction && lootPlan.direction && safeDirection(game,lootPlan.direction.x,lootPlan.direction.z,helpers,1.1))direction=lootPlan.direction;
            if(!direction && lootPlan.direction)lootPlan=null; // avoid aim interactions with unreachable loot
          }
          // Snapshot jitter can briefly make a viable BR loot item disappear.
          // Do not swap to a broad weapon-search heading for one frame and
          // yank back toward the same staircase on the next frame. Continue
          // the recently verified physical route for a *bounded* grace period,
          // but always validate the next segment and yield to urgent ring/dodge.
          if(autonomous && weaponless && !rotatingRing && !direction && !lootPlan &&
             game.modeState?.type==='br'){
            const pending=navigationMemory.get(game);
            if(pending?.path?.length && pending.goal && now-pending.updated<1.2){
              const steer=followRoute3D(game,pending.path,helpers);
              if(steer && (safeDirection(game,steer.x,steer.z,helpers,1.1) ||
                   routeDirectionSafe(game.map,game.local.mv,steer.waypoint)))
                direction={x:steer.x,z:steer.z,reason:'loot-pathfinding'};
            }
          }
          if(weaponless && !rotatingRing && !direction && !lootPlan) {
            const previousLoot=lootMemory.get(game)||{};
            const search=searchForWeapon(game,helpers,previousLoot,now);
            if(search){
              lootMemory.set(game,{...previousLoot,searchSector:search.searchSector,searchUpdated:search.searchUpdated});
              direction=search.direction;
            }
          }
          if(navigational && currentTarget && !direction && !lootPlan && !weaponless && !unready) {
            // While a sidearm is temporarily equipped, keep the main gun's
            // preferred spacing so a sniper bot does not rush into pistol range.
            const primaryGun=game.modeState?.type==='zm' ? null : weaponCatalog[game.local.ws?.guns?.[0]?.id];
            const baseTacticalOptions={...liveOptions,
              enemyWeapon:weaponCatalog[currentTarget?.remote?.data?.w]||null};
            const tacticalOptions=game.local.ws?.slot===1 && primaryGun &&
              !primaryGun.unarmed && !primaryGun.melee
              ? {...baseTacticalOptions, strategicPrimaryWeapon:primaryGun} : baseTacticalOptions;
            const style=weaponProfile(tacticalOptions.strategicPrimaryWeapon || game.local.weapon,tacticalOptions).style;
            if(autonomous && (style==='sniper'||style==='marksman'||options.combatSightline===true) && !currentTarget.visible){
              // A sniper's optional line-of-sight search has its own cache.
              // An unreachable sightline is a legitimate null result and must
              // never overwrite a loot or combat-pursuit route.
              const cache=precisionRouteMemory.get(game);
              if(!cache || cache.id!==currentTarget.id ||
                  (!cache.pending && now-cache.updated>2.0)){
                const goal=planPrecisionSightline(game,currentTarget,helpers,tacticalOptions);
                precisionRouteMemory.set(game,{id:currentTarget.id,updated:now,goal,
                  path:null,pending:!!goal,planner:{}});
              }
              const state=precisionRouteMemory.get(game);
              if(state?.pending){
                const result=gridRouteCooperative(game.map,game.local.mv,state.goal,
                  state.planner,{maxExpanded:2600});
                if(result.status!=='pending'){
                  state.path=result.path;state.pending=false;state.updated=now;
                }
              }
              const steer=followRoute3D(game,state?.path,helpers);
              if(steer && (safeDirection(game,steer.x,steer.z,helpers,1.15) ||
                  routeDirectionSafe(game.map,game.local.mv,steer.waypoint)))
                direction={x:steer.x,z:steer.z,reason:style==='sniper'||style==='marksman'?'precision-find-sightline':'engagement-sightline'};
            }
            if(!direction && options.pathfinding && brRingDestinationAllowed(game,currentTarget.point,options) && !game.local.ws?.reloading && game.local.ws?.guns?.[game.local.ws.slot]?.mag>0 && !lineClear(game,currentTarget.point,helpers)){
              let state=navigationMemory.get(game);
              // Precision sightline, loot, and ordinary pursuit share the route
              // cache. A precision search can legitimately return goal=null.
              // Never read a cached goal until its kind and coordinates match.
              if(!state || state.mode!=='pursuit' || state.id!==currentTarget.id ||
                 !Number.isFinite(state.goal?.x) || !Number.isFinite(state.goal?.z) ||
                 (!state.pending && now-state.updated>2.4) ||
                 Math.hypot(state.goal.x-currentTarget.point.x,state.goal.z-currentTarget.point.z)>4){
                state={mode:'pursuit',id:currentTarget.id,updated:now,goal:{...currentTarget.point},
                  path:null,pending:true,planner:{}};
                navigationMemory.set(game,state);
              }
              if(state.pending){
                const result=gridRouteCooperative(game.map,game.local.mv,currentTarget.point,
                  state.planner,{goalIsAimPoint:true});
                if(result.status!=='pending'){
                  state.path=result.path;state.pending=false;state.updated=now;
                }
              }
              const steer=followRoute3D(game,state.path,helpers);
              if(steer && (safeDirection(game,steer.x,steer.z,helpers,1.1) ||
                   routeDirectionSafe(game.map,game.local.mv,steer.waypoint)))
                direction={x:steer.x,z:steer.z,reason:'pathfinding'};
            }
            if(!direction){
              const old=tacticalMemory.get(game);
              const tacticalHistory=proMovementMemory.get(game)||{};
              let planned=old?.direction;
              if(!old || old.target!==currentTarget.id || now-old.time>.10 ||
                  (planned && Math.hypot(planned.x,planned.z)>.001 && !safeDirection(game,planned.x,planned.z,helpers,1.1))) {
                planned=(autonomous ? planBattleRoyalePush(game,currentTarget,helpers,tacticalOptions,now) : null) ||
                  (options.proMovement!==false
                    ?planProMovement(game,currentTarget,helpers,tacticalOptions,now,tacticalHistory)
                    :planMovement(game,currentTarget,helpers,tacticalOptions,now));
                tacticalMemory.set(game,{time:now,target:currentTarget.id,direction:planned});
                proMovementMemory.set(game,{...tacticalHistory,
                  targetId:currentTarget.id,lastReason:planned?.reason||''});
              }
              direction=planned;
            }
            tacticalActive=!!direction;
          }
          // A strafe may be tactically equivalent but expose us to a different
          // angle. Flip only when the alternate corridor offers hard-cover benefit.
          if(autonomous && options.exposureAwareStrafe===true && !rotatingRing &&
             !lootPlan && !modeObjective && !dodgeActive && currentTarget?.visible && direction){
            const mem=proMovementMemory.get(game)||{};
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,8);
            direction=exposureAwareStrafe(game,currentTarget,direction,contacts,now,mem,
              (x,z,d)=>safeDirection(game,x,z,helpers,d));
            proMovementMemory.set(game,mem);
          }
          // Cooperation is subordinate to survival, ring, loot and safe weapon actions.
          // A teammate actively covering the same enemy creates an opportunity
          // to open an independent firing angle rather than stack in one lane.
          if(autonomous && options.teamCoordination!==false && !rotatingRing && !lootPlan &&
             !weaponless && !unready && !dodgeActive && currentTarget?.visible &&
             (!direction || ['pro-combat-strafe','pro-hold-sightline','pro-rotate','pro-spacing','pro-brake'].includes(direction.reason))){
            let mem=squadMemory.get(game);
            if(!mem){mem={};squadMemory.set(game,mem);}
            const squad=options.teamFlankExperiment===true
              ? squadFlank(game,currentTarget,helpers,now,mem,{safe:safeDirection})
              : squadFlankLegacy(game,currentTarget,helpers,now,mem);
            if(squad)direction=squad;
          }
          // On public TDM death observations, move toward a sheltered engagement
          // lane outside the opponent's randomized respawn zone. Do not charge
          // into spawn protection, or override actual combat / BR urgency.
          if(autonomous && !dodgeActive && !lootPlan && !unready && !rotatingRing &&
              (!direction || ['pathfinding','pro-fallback-cover','precision-find-sightline','engagement-sightline','threat-aware-route'].includes(direction.reason)) &&
              game.modeState?.type==='tdm'){
            const mem=respawnMemory.get(game)||{};respawnMemory.set(game,mem);
            const stage=planRespawnAdvantage(game,now,mem,
              collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog));
            if(stage && (Math.hypot(stage.x,stage.z)<.3 ||
              safeDirection(game,stage.x,stage.z,helpers,1.05))) direction=stage;
          }else if(autonomous && game.modeState?.type==='tdm'){
            // Still update the death transition even if busy with a real threat.
            const mem=respawnMemory.get(game)||{};respawnMemory.set(game,mem);
            observeRespawnWindow(game,now,mem);
          }
          if (direction) s=movementFromWorld(direction,game.rig.yaw,s);
          if(weaponless || unready || escapingRing){
            // Do not aim, shoot, crouch-duel, or reload while holding fists.
            s={...s,fire:false,aim:false,reload:false,plate:false,lean:0,crouch:false,slide:false};
            if(unready)s.slot=loadout.switchSlot;
          } else if (options.enabled && autonomous) {
            const adsMemo=adsPostureMemory.get(game)||{};
            adsPostureMemory.set(game,adsMemo);
            s=autoFireInput(game,s,currentTarget,helpers,liveOptions,adsMemo,now);
          } else if (options.enabled && options.trigger && isEngaged(game)) {
            // Assist mode never overwrites a human firing or reloading action.
            const canFire=shouldTrigger(game,currentTarget,helpers);
            s={...s,fire:canFire || s.fire};
          }
          // Resource arbitration runs after all firing decisions, and observes every
          // opponent plus the last several seconds of pressure/damage/fire inputs.
          combatState=updateCombatMemory(game,s,now,helpers,currentTarget,combatState);
          combatMemory.set(game,combatState);
          if(!rotatingRing && !weaponless && options.enabled && (autonomous || options.autoReload || options.autoSwitch || options.autoArmor)) {
            const resourceState=resourceMemory.get(game)||{};
            resourceMemory.set(game,resourceState);
            s=manageResources(game,s,options,currentTarget,helpers,{now,memory:combatState,
              catalog:weaponCatalog,resourceState,suspendMaintenance:!!lootPlan && !
                (game.modeState?.type==='zm' && game.local.ws?.guns?.[0]?.mag===0)});
          }
          // Recovery controls are *after* resource arbitration. Reload and plate
          // presses this frame therefore obtain an immediate retreat. A valid
          // covered path has priority over ordinary dodge and combat routing;
          // only an imminent explosive or urgent BR ring can supersede it.
          let recoveryPlanned=false;
          if(autonomous && !rotatingRing && !unready && !weaponless &&
             !imminentExplosive && options.reloadCover!==false &&
             game.modeState?.type!=='zm' &&
             (s.reload || s.plate || game.local.ws?.reloading || game.local.ws?.plateT>0)){
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,9);
            const memo=recoveryMemory.get(game)||{};recoveryMemory.set(game,memo);
            const rec=planProtectedRecovery(game,contacts,now,memo,s);
            if(rec && (Math.hypot(rec.x,rec.z)<.25 || safeDirection(game,rec.x,rec.z,helpers,1.1))){
              direction=rec;recoveryPlanned=true;dodgeActive=true;
              s=movementFromWorld(rec,game.rig.yaw,s);
              s.fire=false;s.aim=false;
              if(rec.crouch){s.crouch=true;s.slide=false;}
            }else if(contacts.length && !direction){
              // No accessible cover: sidestep observed firing rays rather than
              // continuing through the central lane at fixed velocity.
              const evasive=predictiveEvasion(game,helpers,contacts,now,memo.fallback||(memo.fallback={}),{range:65});
              if(evasive && safeDirection(game,evasive.x,evasive.z,helpers,1.0)){
                direction=evasive;dodgeActive=true;
                s=movementFromWorld(evasive,game.rig.yaw,s);
              }
            }
          }
          const macroPursuitCandidate=direction;
          // The strategic range goal is independent of the camera/aim target.
          // It only arbitrates a conflicting cover-peek action after the camera
          // planner runs; normal cover and urgent movement keep precedence.
          let macroRangePhase=null;
          if(autonomous && options.macroCombat2===true && currentTarget && !weaponless && !unready){
            const mem=macroCombatMemory.get(game)||{};macroCombatMemory.set(game,mem);
            macroRangePhase=macroCombatPhase(game,currentTarget,game.local.weapon,now,mem);
          }

          // Camera-aware cover arbitration follows weapon/resource decisions, so
          // reloads that start THIS tick immediately drive the bot behind cover.
          // BR emergency rotation, imminent explosives, zombie kiting and loot
          // acquisition retain priority; the assistant never invents a safe lane.
          if(autonomous && options.cameraTactics!==false && !recoveryPlanned && !rotatingRing && !weaponless &&
             !unready && !dodgeActive && game.modeState?.type!=='zm' &&
             (options.reloadCover!==false || options.autoPeek)) {
            const ws=game.local.ws,gun=ws?.guns?.[ws.slot];
            const reloading=!!(ws?.reloading || s.reload);
            let memory=cameraTacticsMemory.get(game);
            if(!memory){memory={};cameraTacticsMemory.set(game,memory);}
            const contacts=collectThreatIntel(game,options.enemyAmmoAwareness!==false?
              shotIntel.get(game):null,now,weaponCatalog).slice(0,10);
            // Keep the cached cover anchor current even during active exchanges.
            // Turning the planner off entirely until the next crisis produces
            // stale cover paths and was worse against stress opponents in TDM.
            // Avoid a perpetual hide/peek loop when a valid, safe pursuit path
            // already leads around cover to a presently occluded opponent.
            // Critical HP, incoming damage and close contact still favor cover.
            const safePursuit=options.routeCommitment!==false && game.modeState?.type==='tdm' && !reloading &&
              shouldFollowOccludedRoute(game,currentTarget,direction,contacts,combatState,now);
            if(contacts.length && !safePursuit && (reloading && options.reloadCover!==false ||
                !reloading && !lootPlan && !modeObjective && options.autoPeek && currentTarget)) {
              const allowPeek=shouldUseCombatPeek(game,currentTarget,combatState,contacts,now,options);
              const camPlan=planCameraMovement(game,contacts,currentTarget,now,memory,{
                reloading,peek:!reloading&&options.autoPeek&&allowPeek,hasShot:!!s.fire,longDelay:options.peekLongDelay!==false,
                peekCacheLab:options.peekCacheLab===true,
                ringCheck:p=>brRingDestinationAllowed(game,p,options)
              });
              const continueBlindPursuit=options.occludedPursuitLab===true && !reloading &&
                shouldMaintainOccludedPursuit(game,contacts,currentTarget,direction,
                  camPlan,{now,lastDamage:combatState?.lastDamage});
              if(camPlan?.direction && !continueBlindPursuit){
                const dx=camPlan.direction.x,dz=camPlan.direction.z;
                const mv=game.local.mv,waypoint={x:mv.x+dx,z:mv.z+dz,y:mv.y};
                if(Math.hypot(dx,dz)<.55 || safeDirection(game,dx,dz,helpers,1.05)){
                  direction=camPlan.direction;
                }else if(now-(memory.pathAt||0)>.65||!memory.path?.length){
                  memory.path=gridRoute(game.map,mv,waypoint,{maxExpanded:1800,
                    riskWeight:.25,threats:contacts});memory.pathAt=now;
                }
                if(direction!==camPlan.direction && memory.path?.length){
                  while(memory.path.length&&Math.hypot(memory.path[0].x-mv.x,
                      memory.path[0].z-mv.z)<1.25)memory.path.shift();
                  const wp=memory.path[0];
                  if(wp && safeDirection(game,wp.x-mv.x,wp.z-mv.z,helpers,1.0))
                    direction={x:wp.x-mv.x,z:wp.z-mv.z,reason:'camera-cover-path'};
                }
                if(direction && (direction===camPlan.direction || direction.reason==='camera-cover-path')){
                  s=movementFromWorld(direction,game.rig.yaw,s);
                  if(camPlan.holdFire && !reloading){s.fire=false;s.aim=false;}
                  if(camPlan.phase==='reload' && Math.hypot(dx,dz)<1.35) s.crouch=true;
                }
              }
            }
          }
          if(autonomous && options.macroCombat2===true && macroRangePhase && !dodgeActive &&
             !recoveryPlanned && !rotatingRing && !lootPlan && !modeObjective &&
             !weaponless && !unready){
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,6);
            const resolved=macroCombatArbitrate(game,currentTarget,macroRangePhase,
              macroPursuitCandidate,direction,{
                canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
                exposureAllowed:p=>{
                  if(game.local.hp<78 || game.local.armor<24 ||
                    now-(combatState?.lastDamage??-Infinity)<1.7) return false;
                  // When approaching a visible dangerous weapon, do not
                  // substitute an exposed direct charge for real hard cover.
                  return contacts.every(c=>{
                    if(!c || !Number.isFinite(c.x)||!Number.isFinite(c.z))return true;
                    const range=Math.hypot(c.x-p.x,c.z-p.z);
                    if(range>Math.min(60,c.weapon?.maxRange??60))return true;
                    return cameraOccluded(game.map,
                      {x:c.x,y:(c.y||0)+1.5,z:c.z},
                      {x:p.x,y:p.y+1.35,z:p.z});
                  });
                }
              });
            if(resolved!==direction && resolved?.reason==='macro-range-approach'){
              direction=resolved;s=movementFromWorld(direction,game.rig.yaw,s);
            }
            // Research only: select a *shootable* distant vantage first and
            // verify A* to that goal. Never displace current combat/escape.
            if(resolved===direction && options.macroVantageLab===true &&
                game.modeState?.type==='tdm' && currentTarget?.visible===false){
              const memo=macroVantageMemory.get(game)||{};
              macroVantageMemory.set(game,memo);
              const vantage=chooseMacroVantage(game,currentTarget,macroRangePhase,
                macroPursuitCandidate,direction,now,memo,{
                route:(start,goal)=>gridRoute(game.map,start,goal,{maxExpanded:450,riskWeight:0}),
                shotClear:(eye,enemy)=>!cameraOccluded(game.map,eye,enemy),
                canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
                riskAt:p=>cameraExposure(game.map,p,contacts,.3).risk,
                temporal:options.macroTemporalLab===true,
                onDecision:event=>document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
                  detail:JSON.stringify({t:now,...event})
                }))
              });
              if(vantage!==direction && vantage?.reason==='macro-vantage-approach'){
                direction=vantage;s=movementFromWorld(direction,game.rig.yaw,s);
              }
            }
            // Optional corridor-aware second stage. The legacy macro applies
            // first; detours are tried only when an exposed direct route was
            // rejected and a geometrically legal, demonstrably safer lane exists.
            if(resolved===direction && options.macroCoverApproach===true && contacts.length){
              const coverMemo=macroCoverMemory.get(game)||{};macroCoverMemory.set(game,coverMemo);
              const covered=chooseCoveredApproach(game,currentTarget,macroRangePhase,
                macroPursuitCandidate,direction,contacts,now,coverMemo,{
                canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
                exposureAt:(p,cs)=>cameraExposure(game.map,p,cs,.2).risk,
                hardCoverAt:(p,cs)=>{
                  let tested=0;
                  for(const c of cs){
                    if(!Number.isFinite(c?.x)||!Number.isFinite(c?.z))continue;
                    if(Math.hypot(c.x-p.x,c.z-p.z)>Math.min(80,c.weapon?.maxRange??80))continue;
                    tested++;
                    if(!cameraOccluded(game.map,{x:c.x,y:(c.y||0)+1.5,z:c.z},
                      {x:p.x,y:p.y+1.35,z:p.z}))return false;
                  }
                  return tested>0;
                }
              });
              if(covered!==direction && covered?.reason==='macro-covered-approach'){
                direction=covered;s=movementFromWorld(direction,game.rig.yaw,s);
              }
            }
          }
          // Macro action layer: only intercept conflicting, observable and safe
          // blind-pursuit vs retreat-to-cover directions. All higher-priority
          // reload, urgent ring, loot, objective, and evade flows remain in charge.
          if((options.macroRoutingLab===true || options.macroActuationLab===true) && autonomous && currentTarget && !dodgeActive &&
             !recoveryPlanned && !rotatingRing && !lootPlan && !modeObjective &&
             !weaponless && !unready && macroPursuitCandidate){
            const macroMemo=macroMemory.get(game)||{};macroMemory.set(game,macroMemo);
            const contactList=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,4);
            const resolved=macroGoalDecision(game,currentTarget,macroPursuitCandidate,direction,
              contactList,now,macroMemo,{lastDamage:combatState?.lastDamage,
              isSafe:(x,z,d)=>safeDirection(game,x,z,helpers,d),
              exposureSafe:(p,cs)=>cs.every(c=>{
                const eye={x:c.x,y:(c.y||0)+1.5,z:c.z};
                return cameraOccluded(game.map,eye,{x:p.x,y:p.y+1.3,z:p.z});
              })});
            if(resolved!==direction && resolved?.reason==='macro-safe-advance'){
              direction=resolved;s=movementFromWorld(direction,game.rig.yaw,s);
            }
          }
          // Research-only single owner for a short route-vs-peek conflict.
          // Run after all optional planners, before posture/smoothing; firing
          // and aim are independent and are never modified by this arbiter.
          if(autonomous && options.macroOwnershipLab===true && game.modeState?.type==='tdm'){
            const memo=macroOwnerMemory.get(game)||{};macroOwnerMemory.set(game,memo);
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,6);
            const owned=macroActionOwnership(game,currentTarget,macroPursuitCandidate,direction,now,memo,{
              emergency:imminentExplosive || rotatingRing || escapingRing,
              ring:rotatingRing,recovery:recoveryPlanned || s.reload || s.plate,
              loot:!!lootPlan,objective:!!modeObjective,dodge:dodgeActive,
              unready,weaponless,visibleShot:!!(currentTarget?.visible && s.fire),
              lastDamage:combatState?.lastDamage,engageAt:macroRangePhase?.engageAt,
              canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
              exposureAllowed:p=>contacts.every(c=>{
                if(!Number.isFinite(c?.x)||!Number.isFinite(c?.z))return true;
                if(Math.hypot(c.x-p.x,c.z-p.z)>Math.min(55,c.weapon?.maxRange??55))return true;
                return cameraOccluded(game.map,{x:c.x,y:(c.y||0)+1.5,z:c.z},
                  {x:p.x,y:p.y+1.3,z:p.z});
              }),
              onDecision:event=>document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
                detail:JSON.stringify({t:now,...event})}))
            });
            if(owned!==direction && owned?.reason==='macro-owner-approach'){
              direction=owned;s=movementFromWorld(direction,game.rig.yaw,s);
            }
          }
          // A visible enemy is not necessarily a shootable one: the target
          // must also be inside useful weapon range with ready ammunition.
          const macroShotOpportunity=!!(currentTarget?.visible && !weaponless && !unready &&
            !game.local.ws?.reloading && !s.reload && !s.plate &&
            targetDistance(game,currentTarget)<=Math.max(8,macroRangePhase?.engageAt??
              (game.local.weapon?.cat==='Shotgun'?13:Math.min(60,game.local.weapon?.maxRange??60))));
          // Macro Options v3: one explicit tactical movement option evaluated
          // after the legacy planners. Shadow mode is output-identical;
          // active mode exists ONLY in the headless simulator profile.
          const macroOptionsEnabled=autonomous && (options.macroOptionsShadow===true || options.macroOptionsActive===true || options.goalAwareShadow===true || options.goalAwareActive===true) && game.modeState?.type==='tdm';
          if(macroOptionsEnabled){
            const memo=macroOptionMemory.get(game)||{};macroOptionMemory.set(game,memo);
            const emitOption=e=>{if(e.state==='option-cycle-evidence'&&e.label==='candidate-low-yield'&&e.sequence?.[1]==='TAKE_COVER')memo.lowYieldEvidence={...e,time:now};document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
              detail:JSON.stringify({t:now,...e})}));};
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,6);
            const result=macroOptionDecision(game,currentTarget,macroPursuitCandidate,direction,now,memo,{
              active:options.macroOptionsActive===true && globalThis.__FPSARENA_HEADLESS_LAB__===true,
              emergency:imminentExplosive || escapingRing,
              ring:rotatingRing,recovery:recoveryPlanned || s.reload || s.plate,
              loot:!!lootPlan,objective:!!modeObjective,dodge:dodgeActive,
              unready,weaponless,fire:!!s.fire,shotOpportunity:macroShotOpportunity,
              lastDamage:combatState?.lastDamage,engageAt:macroRangePhase?.engageAt,
              canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
              exposureAllowed:p=>contacts.every(c=>{
                if(!Number.isFinite(c?.x)||!Number.isFinite(c?.z))return true;
                if(Math.hypot(c.x-p.x,c.z-p.z)>Math.min(55,c.weapon?.maxRange??55))return true;
                return cameraOccluded(game.map,{x:c.x,y:(c.y||0)+1.5,z:c.z},
                  {x:p.x,y:p.y+1.3,z:p.z});
              }),onDecision:emitOption
            });
            if(options.macroOptionsActive===true && globalThis.__FPSARENA_HEADLESS_LAB__===true && result!==direction && result?.reason==='macro-option-approach'){
              direction=result;s=movementFromWorld(direction,game.rig.yaw,s);
            }
          }
          // v2.9.8: late goal attribution / evidence-gated arbitration, simulator only.
          const goalAwareEnabled=autonomous && game.modeState?.type==='tdm' &&
            (options.goalAwareShadow===true || options.goalAwareActive===true);
          if(goalAwareEnabled){
            const memo=goalAwareMemory.get(game)||{};goalAwareMemory.set(game,memo);
            const optionMemo=macroOptionMemory.get(game);
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,5);
            const emitGoal=e=>document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
              detail:JSON.stringify({t:now,...e})}));
            const selected=goalAwareDecision(game,currentTarget,macroPursuitCandidate,direction,now,memo,{
              active:options.goalAwareActive===true && globalThis.__FPSARENA_HEADLESS_LAB__===true,
              emergency:imminentExplosive||escapingRing,ring:rotatingRing,
              recovery:recoveryPlanned||s.reload||s.plate,loot:!!lootPlan,
              objective:!!modeObjective,dodge:dodgeActive,unready,weaponless,
              fire:!!s.fire,shotOpportunity:macroShotOpportunity,
              lastDamage:combatState?.lastDamage,engageAt:macroRangePhase?.engageAt,
              evidence:optionMemo?.lowYieldEvidence,
              canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
              exposureAllowed:p=>contacts.every(c=>{
                if(!Number.isFinite(c?.x)||!Number.isFinite(c?.z))return true;
                if(Math.hypot(c.x-p.x,c.z-p.z)>Math.min(60,c.weapon?.maxRange??60))return true;
                return cameraOccluded(game.map,{x:c.x,y:(c.y||0)+1.5,z:c.z},
                  {x:p.x,y:p.y+1.3,z:p.z});
              }),onDecision:emitGoal
            });
            if(selected!==direction && options.goalAwareActive===true &&
               globalThis.__FPSARENA_HEADLESS_LAB__===true){
              direction=selected;s=movementFromWorld(direction,game.rig.yaw,s);
              macroOptionReconcile(macroOptionMemory.get(game),currentTarget,direction,now,{onDecision:emitGoal});
            }
          }
          // Macro Combat 3.x tactical utility director. This *one final* decision
          // layer is isolated behind a headless-only active profile. Shadow
          // evaluates candidate attack sites but is reference-identical to the
          // legacy selected direction, and never changes aim/fire/ADS or modes.
          if(autonomous && (options.tacticalDirectorShadow===true || options.tacticalDirectorActive===true) &&
             ['tdm','snd','hp','br','zm'].includes(game.modeState?.type)){
            const directorMemo=tacticalDirectorMemory.get(game)||{};
            tacticalDirectorMemory.set(game,directorMemo);
            const contacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog).slice(0,6);
            const directorActive=options.tacticalDirectorActive===true &&
              globalThis.__FPSARENA_HEADLESS_LAB__===true && game.modeState?.type==='tdm';
            const proposed=tacticalDirectorDecision(game,currentTarget,direction,now,directorMemo,{
              active:directorActive,conservative:options.tacticalDirectorConservative===true,
              opportunityGuard:options.tacticalDirectorOpportunityGuard===true,
              engagementWindow:options.tacticalDirectorEngagementWindow===true,
              engagementTrial:options.tacticalDirectorEngagementTrial===true,
              engagementProbe:options.tacticalDirectorEngagementProbe===true,
              engagementRecovery:options.tacticalDirectorEngagementRecovery===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              opportunityExpansion:options.tacticalDirectorOpportunityExpansion===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              maxShotProbes:8,shotProbeSpacing:5,
              shotProbeCoverage:options.tacticalDirectorShotProbeCoverage===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              effectiveWeaponBand:options.tacticalDirectorMainWeaponStatsLab===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              ballisticScoring:options.tacticalDirectorBallisticLab===true &&
                options.tacticalDirectorMainWeaponStatsLab===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              ballisticAimPoint:options.target==='head'?'head':'torso',
              motionScoring:options.tacticalDirectorMotionLab===true &&
                options.tacticalDirectorBallisticLab===true &&
                options.tacticalDirectorMainWeaponStatsLab===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              motionLagSeconds:Math.min(.18,Math.max(0,options.predictionMs/1000)),
              engagementExploration:options.tacticalDirectorExplorationLab===true &&
                globalThis.__FPSARENA_HEADLESS_LAB__===true,
              explorationSeed:globalThis.__FPSARENA_HEADLESS_LAB__===true ?
                globalThis.__FPSARENA_EXPLORATION_SEED__ : undefined,
              explorationProbability:globalThis.__FPSARENA_HEADLESS_LAB__===true ?
                globalThis.__FPSARENA_EXPLORATION_PROBABILITY__ : undefined,
              emergency:imminentExplosive||escapingRing,ring:rotatingRing,
              recovery:recoveryPlanned||s.reload||s.plate,loot:!!lootPlan,
              objective:!!modeObjective,dodge:dodgeActive,unready,weaponless,
              fire:!!s.fire,shotOpportunity:macroShotOpportunity,
              lastDamage:combatState?.lastDamage,
              evidence:macroOptionMemory.get(game)?.lowYieldEvidence,
              route:(start,goal)=>gridRoute(game.map,start,goal,{maxExpanded:200,riskWeight:0,threats:contacts}),
              canStep:(x,z,d)=>safeDirection(game,x,z,helpers,d),
              riskAt:(p,arrival=0)=>cameraExposure(game.map,p,contacts,Math.min(2.5,Math.max(.15,arrival))).risk,
              walkable:p=>walkableSurface(game.map,p.x,p.z,p.y),
              maxRoutes:options.tacticalDirectorOpportunityExpansion===true?3:2,
              maxProbes:options.tacticalDirectorOpportunityExpansion===true?28:12,
              allowVertical:game.modeState?.type==='br',
              verticalSurface:p=>standingRouteAimLevel(game.map,p),
              shotClear:(eye,enemy)=>!cameraOccluded(game.map,eye,enemy),
              onDecision:event=>document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
                detail:JSON.stringify({t:now,...event})
              }))
            });
            if(directorActive && proposed!==direction && proposed?.reason?.startsWith('director-')){
              direction=proposed;s=movementFromWorld(direction,game.rig.yaw,s);
              // A planned route is not necessarily a selected client command.
              // Record the first actual controller selection exactly once/plan.
              if(directorMemo.plan?.planId!==undefined&&
                 directorMemo.appliedPlanId!==directorMemo.plan.planId){
                directorMemo.appliedPlanId=directorMemo.plan.planId;
                document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
                  detail:JSON.stringify({t:now,state:'director-command-selected',
                    planId:directorMemo.plan.planId,targetId:directorMemo.plan.targetId,
                    type:directorMemo.plan.type})
                }));
              }
              if(options.macroOptionsShadow===true || options.goalAwareShadow===true)
                macroOptionReconcile(macroOptionMemory.get(game),currentTarget,direction,now,{});
            }
          }
          if(options.proMovement!==false && (direction || options.stanceMixup && game.modeState?.type==='tdm') && navigational && autonomous && !unready && !rotatingRing) {
            const posture=stanceMemory.get(game)||{};
            // Stance selection is after firearm/resource arbitration: never initiate
            // a slide while a shot, reload, armor plate or interaction is active.
            const stanceDirection=lootPlan?.direction
              ? {...direction,sprint:lootPlan.distance>14,reason:direction.reason||'loot-travel',goal:lootPlan.goal}
              : direction || {x:0,z:0,reason:'evasion-posture'};
            const projectileDanger=Array.from(projectileObservations.get(game)?.values()||[])
              .some(p=>p?.stuck && p.fuse>=0 && p.fuse<1.2 && Math.hypot(p.x-game.pos.x,p.z-game.pos.z)<9);
            const critical=game.local.hp<45 || projectileDanger;
            if(weaponless){
              // No fake duck/sideways shooting stances when looking for equipment.
              posture.crouchUntil=0;
              s=applyProStance(game,s,stanceDirection,now,posture,
                {...options,evasiveCrouch:false,autoCrouch:false},helpers,{autonomous,critical:false});
            }else s=applyProStance(game,s,stanceDirection,now,posture,options,helpers,{autonomous,critical});
            if(options.stanceMixup===true && game.modeState?.type==='tdm' && !weaponless && !lootPlan){
              const stanceContacts=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog);
              s=adaptiveDefensiveStance(game,s,stanceContacts,now,posture);
            }
            // Changing the eye height changes the correct pitch immediately.
            // Aim after the crouch decision, before LocalPlayer.tick sends yaw/pitch.
            if(options.fastAim!==false && s.crouch && !game.local.mv.slideT && currentTarget?.visible && !s.use){
              const d=currentTarget.point,dx=d.x-game.pos.x,dz=d.z-game.pos.z;
              const standing=helpers.eyeHeightOf(game.local.mv);
              const crouched=constants.STANCE_EYE?.[1]??standing;
              game.rig.pitch=Math.max(-constants.PITCH_MAX,Math.min(constants.PITCH_MAX,
                Math.atan2(d.y-(game.pos.y+crouched),Math.hypot(dx,dz))));
            }
            stanceMemory.set(game,posture);
          }
          if(autonomous && lootPlan && !dodgeActive && !unready && !rotatingRing &&
             !game.local.ws?.reloading && !s.reload &&
             !(lootPlan.interact && game.modeState?.type==='zm' && currentTarget?.visible &&
               targetDistance(game,currentTarget)<16 && !weaponless)){
            // Do NOT suppress valid shots just because a crate is far away.
            // Pause firing only when actively pressing F at interaction range.
            s=arbitrateLootCombat(s,lootPlan,{autonomous,shootable:!!currentTarget?.visible});
            if(lootPlan.interact && lootPlan.prepareSlot!==null && lootPlan.prepareSlot!==undefined &&
               game.local.ws.slot!==lootPlan.prepareSlot){
              s.slot=lootPlan.prepareSlot;s.use=false;s.interact=false;
            }else if(lootPlan.interact){
              game.rig.yaw=lootPlan.yaw;game.rig.pitch=lootPlan.pitch;
              s.use=!!lootPlan.use;s.interact=!!lootPlan.use;
            }
          }
          if(rotatingRing && direction){
            const motion=motionMemory.get(game)||{};motionMemory.set(game,motion);
            s=stabilizeMovement(s,direction,game.rig.yaw,now,motion,{ringPriority:escapingRing,
              safePrevious:v=>safeDirection(game,v.x,v.z,helpers,.8),
              reverseHoldMs:escapingRing?options.reverseHoldMs:Math.max(550,options.reverseHoldMs??380)});
          }else if(autonomous && navigational){
            const motion=motionMemory.get(game)||{};motionMemory.set(game,motion);
            // Only smooth a real, currently navigable proposal. A stale route is discarded.
            const safePrevious=v=>safeDirection(game,v.x,v.z,helpers,.75);
            // Route steering can pass through short over-corrections when an A*
            // waypoint or a camera sightline changes. Hold a still-clear
            // world-space heading slightly longer for navigation, but do
            // not delay combat, explosive avoidance or urgent zone travel.
            const routeHeading=!!direction && /^(?:br-ring-path|br-next-ring|loot-pathfinding|pathfinding|precision-find-sightline|engagement-sightline)$/.test(direction.reason||'');
            const reverseHoldMs=routeHeading?Math.max(550,options.reverseHoldMs??380):options.reverseHoldMs;
            s=stabilizeMovement(s,direction,game.rig.yaw,now,motion,{safePrevious,reverseHoldMs});
          }
          // Plant / defuse through valid F-hold input; avoid interrupting a
          // close fight. The server still validates team, site and distance.
          if(modeObjective?.hold && modeObjective.interact && !dodgeActive && (s.slot===-1 || s.slot==null) &&
             !s.fire && !game.local.ws?.reloading){
            s={...s,forward:false,backward:false,left:false,right:false,
              use:true,interact:true,fire:false,aim:false,slide:false};
          }
          if(escapingRing){
            // Break sidearm-maintenance mode on ring emergency. Leave the bot
            // holding a loaded primary rather than a zero-round secondary.
            const pending=resourceMemory.get(game);
            if(pending?.secondaryPending){
              pending.secondaryPending=false;
              if(game.local.ws.slot===1 && game.local.ws.guns?.[0]?.mag>0 &&
                 !game.local.ws.plateT && !game.local.ws.switchT)s.slot=0;
            }
            s={...s,fire:false,aim:false,reload:false,plate:false,crouch:false,slide:false,prone:false,lean:0,use:false};
          }
          // Skills are server-authoritative, with an input edge on T. Plan
          // AFTER locomotion, gun resources and BR-ring arbitration so a skill
          // cannot accidentally override a higher-priority action. Only
          // Autopilot controls T; Aim Assist keeps the user's physical input.
          let chosenSkill=null;
          if(autonomous && options.autoSkills!==false && !baseline.skill){
            const memo=skillMemory.get(game)||{};
            skillMemory.set(game,memo);
            const planned=skillDecision(game,s,{
              now,enabled:options.autoSkills!==false,direction,ringUrgent:escapingRing,
              targetDistance:currentTarget?targetDistance(game,currentTarget):Infinity,
              targetVisible:!!currentTarget?.visible
            },memo,skills.SKILLS,{
              safeDirection:(x,z,meters)=>safeDirection(game,x,z,helpers,meters),
              ringAllowed:p=>brRingDestinationAllowed(game,p,options),
              rayWorld:helpers.rayWorld
            });
            s=planned.input;
            if(Number.isFinite(s.__skillYaw)){
              game.rig.yaw=s.__skillYaw;game.rig.pitch=s.__skillPitch||0;
              delete s.__skillYaw;delete s.__skillPitch;
            }
            if(planned.skill){
              chosenSkill=planned.skill;
              recordEvent(game,'skill-command',{id:planned.skill,why:planned.reason});
            }
          }
          // Auto-G uses the server's actual press-edge contract. Never spend
          // a throwable during a higher-priority interaction, recovery or ring
          // escape, or on a trajectory intersecting known solid geometry.
          if(autonomous && options.autoThrowables!==false && !rotatingRing &&
             !unready && !escapingRing && !imminentExplosive && !baseline.throw){
            const memo=throwableMemory.get(game)||{};throwableMemory.set(game,memo);
            const intel=collectThreatIntel(game,shotIntel.get(game),now,weaponCatalog);
            const throwable=autoThrowableDecision(game,s,currentTarget,intel,now,memo,skills.THROWABLES);
            if(throwable?.throw){
              s.throw=true;s.fire=false;s.aim=false;
              if(Number.isFinite(throwable.yaw)){
                game.rig.yaw=throwable.yaw;game.rig.pitch=throwable.pitch;
              }
              recordEvent(game,'throwable-command',{why:throwable.reason});
            }
          }
          if(autonomous && !rotatingRing && !escapingRing){
            s=restoreActionableFire(game,s,currentTarget,helpers,liveOptions,{
              ringUrgent:escapingRing,dodgeSprint:!!direction?.suppressFire,
              weaponless,unready},adsPostureMemory.get(game),now);
          }
          if(goalAwareEnabled){
            const memo=goalAwareMemory.get(game);
            goalAwareObserve(currentTarget,s,now,memo,{
              shotOpportunity:macroShotOpportunity,movementSuppressFire:!!direction?.suppressFire,
              onDecision:e=>document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
                detail:JSON.stringify({t:now,...e})}))
            });
          }
          if(macroOptionsEnabled){
            const memo=macroOptionMemory.get(game);
            macroOptionObserve(game,currentTarget,s,now,memo,{
              shotOpportunity:macroShotOpportunity,
              onDecision:e=>document.dispatchEvent(new CustomEvent('fpsarena-aim:macro-decision',{
                detail:JSON.stringify({t:now,...e})}))
            });
          }
          faultMemory.delete(game);
          lastRecordedAction={input:s,decision:{reason:direction?.reason||'hold',loot:lootPlan?.reason||'',
            dodge:dodgeActive,ring:rotatingRing,weaponScore:livePolicy?.score,skill:chosenSkill}};
          return s;
          } catch(error) {
            // Fail open to unmodified player input, not an uncaught exception
            // inside the authoritative game's simulation loop. Suspend the bot
            // until the user explicitly re-enables it after inspecting the error.
            const now=performance.now()/1000;
            const prior=faultMemory.get(game)||{count:0,last:-Infinity};
            const count=now-prior.last>12?1:prior.count+1;
            // A single bad Zombies tick must not permanently switch Autopilot off.
            // Cool down repeated failures rather than throwing into Game.simTick.
            faultMemory.set(game,{count,last:now,retryAt:now+(count>=3?2:.15),epoch:faultEpoch});
            if(count===1||count===3)try{postStatus('error', `Combat Suite recovered from tick error (${count}): ${String(error?.message||error).slice(0,125)}`);}catch(_){}
            return baseline;
          }
        };
        try {return originalTick.apply(game,args);}
        finally {
          try {recordTick(game,lastRecordedAction?.input,lastRecordedAction?.decision||{});} catch (_) {}
          lastRecordedAction=null;
          if (hadOwn) game.input.sample=originalSample;else delete game.input.sample;
        }
      };
    }
    // Visual recoil compensation leaves authoritative recoil, spread, and damage rules intact.
    if(typeof Game.prototype.onFire==='function') {
      const originalFire=Game.prototype.onFire;
      Game.prototype.onFire=function(...args){
        if(!options.recoil || !options.enabled || !isEngaged(this)){
          const result=originalFire.apply(this,args);
          const t=performance.now()/1000;
          if(t-lastRecordedFire>.15){lastRecordedFire=t;
            recordEvent(this,'own-fire',{weapon:String(this.local?.weapon?.id||'').slice(0,48)});}
          return result;
        }
        const oldYaw=this.rig.yaw,oldPitch=this.rig.pitch,oldPool=this.recoilPool||0;
        const result=originalFire.apply(this,args);
        const t=performance.now()/1000;
        if(t-lastRecordedFire>.15){lastRecordedFire=t;
          recordEvent(this,'own-fire',{weapon:String(this.local?.weapon?.id||'').slice(0,48)});}
        this.rig.yaw=wrapAngle(this.rig.yaw-wrapAngle(this.rig.yaw-oldYaw));
        this.rig.pitch=Math.max(-constants.PITCH_MAX,Math.min(constants.PITCH_MAX,oldPitch));
        this.recoilPool=oldPool;
        return result;
      };
    }
    function report(game) {
      const state = 'ready';
      const detail = !game?.running ? 'Waiting for a match' : currentTarget ? 'Target acquired' : 'Scanning';
      const fingerprint = `${state}/${detail}/${options.enabled}/${options.mode}/${!!currentTarget}/${options.esp}/${options.dodge}/${dodgeActive}/${tacticalActive}/${options.radar}`;
      const now = performance.now();
      if (fingerprint !== lastSent || now - lastEmit > 2500) {
        lastSent = fingerprint; lastEmit = now;
        emit('status', { state, message: `${detail} · ${options.mode.toUpperCase()} · ESP ${options.esp ? 'ON' : 'OFF'} · EVADE ${dodgeActive ? 'ACTIVE' : 'READY'}`, tracking: !!currentTarget, enabled: options.enabled });
      }
    }
    function updateOverlay(game) {
      const visible = !!(avatarControllable(game) && (options.enabled || options.esp || options.dodge || options.radar || options.grenadeAssist));
      root.style.display = visible ? '' : 'none';
      if (!visible) { hideEsp();radarCanvas.style.display='none';grenadeHUD.style.display='none'; return; }
      ring.style.display = options.enabled && options.showRing ? '' : 'none';
      dot.style.display = options.enabled ? '' : 'none';
      if (options.enabled && options.showRing) {
        const fov = game.rig.camera.fov || 75;
        const size = Math.min(innerWidth * 2, innerHeight * Math.tan(options.fov * Math.PI / 180) / Math.tan(fov * Math.PI / 360));
        ring.style.width = `${size}px`; ring.style.height = `${size}px`;
      }
      dot.style.background = currentTarget ? '#ffe486' : '#61e2ff';
      tag.textContent = `${options.enabled && options.mode==='autopilot' && ringSafetyPlan(game,options) ? 'ROTATE TO RING · ' : ''}${options.enabled && options.mode==='autopilot' && (weaponLootState(game,weaponCatalog).needsWeapon || weaponLootState(game,weaponCatalog).needsAmmo) ? 'FIND SUPPLIES · ' : ''}${options.enabled && options.mode==='autopilot' ? weaponProfile(game.local.weapon,options).style.toUpperCase()+' · ' : ''}${game.local.ws?.reloading ? 'RELOADING · ' : ''}${options.mode==='autopilot' && options.enabled ? 'AUTOPILOT' : 'AIM'} ${options.enabled ? currentTarget ? 'LOCK' : 'SCAN' : 'OFF'} · ESP ${options.esp ? 'ON' : 'OFF'} · EVADE ${dodgeActive ? '!' : '—'} · F8`;
      updateRadar(game);
      if(options.grenadeAssist && currentTarget) {
        const guide=grenadeGuide(game,currentTarget,helpers,skills.THROWABLES,skills.THROW_SPEED);
        grenadeHUD.style.display=guide?'':'none';
        if(guide)grenadeHUD.textContent=`${guide.kind.toUpperCase()}: ${(guide.pitch*180/Math.PI).toFixed(1)}° THROW · ${Math.round(guide.range)} m (estimate)`;
      } else grenadeHUD.style.display='none';
      updateEsp(game);
    }
    function isEngaged(game) {
      if (!options.enabled || !avatarControllable(game)) return false;
      // New scorestreak client removed shared/weaponstate.aimLocked.
      // Let the game maintain any weapon-specific restrictions.
      if (options.mode === 'autopilot') return true;
      if (options.activation === 'ads') return !!game.input.aimHeld;
      if (options.activation === 'hold') return heldKeys.has(options.holdKey);
      return true;
    }
    // Execute right after ordinary mouse look and right before the server input is sampled.
    const originalLook = CameraRig.prototype.look;
    CameraRig.prototype.look = function (...args) {
      const result = originalLook.apply(this, args);
      const game = activeGame;
      if (active && game?.rig === this && isEngaged(game) &&
          !(options.mode==='autopilot' && (weaponLootState(game,weaponCatalog).needsWeapon || weaponLootState(game,weaponCatalog).needsAmmo || ringSafetyPlan(game)?.urgent))) {
        const t = options.mode==='autopilot' ? acquireCombatTarget(game,options,helpers,lastTargetId) : findTarget(game,options,helpers,lastTargetId);
        currentTarget = t;
        lastTargetId = t?.id || null;
        if (t && (options.mode!=='autopilot' || t.visible)) {
          const smoothing=options.mode==='autopilot' && options.fastAim!==false
            ? (game.modeState?.type==='br' && t.remote?.data?.air ? 10 : 0) : options.smoothing;
          const step = aimStep(this.yaw, this.pitch, t, activeDt, smoothing, constants.PITCH_MAX);
          this.yaw = step.yaw; this.pitch = step.pitch;
        }
      } else { currentTarget = null; lastTargetId = null; }
      return result;
    };
    const originalFrame = Game.prototype.frame;
    Game.prototype.frame = function (dt, isActive, paused) {
      activeGame = this; activeDt = dt; active = isActive; dodgeActive = false;tacticalActive=false;
      const autoAds=options.enabled && options.mode==='autopilot' && !!isActive &&
        avatarControllable(this) && weaponLootState(this,weaponCatalog).activeArmed && !weaponLootState(this,weaponCatalog).needsAmmo && !ringSafetyPlan(this)?.urgent;
      const oldAds=this.input?.aimHeld;
      if(autoAds)this.input.aimHeld=true;
      try { return originalFrame.apply(this, arguments); }
      finally {
        if(autoAds)this.input.aimHeld=oldAds;
        activeGame = null; active = false;
        if (!isEngaged(this)) { currentTarget = null; lastTargetId = null; }
        updateOverlay(this); report(this);
      }
    };
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Never steal typing shortcuts from the menu or settings.
      const inGame = document.querySelector('#hud.active');
      if (!inGame || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      heldKeys.add(e.code);
      if(e.code===options.switchWeaponKey && options.switchWeaponKey!=='None' &&
         options.mode!=='autopilot' && !e.ctrlKey && !e.altKey && !e.metaKey){
        manualWeaponSwapRequestedAt=performance.now()/1000;
        e.preventDefault();
      }
      if (e.code === 'F8') {
        options = { ...options, enabled: !options.enabled };
        lastTargetId = null;
        emit('toggled', { enabled: options.enabled });
        e.preventDefault();
      }
    }, true);
    document.addEventListener('keyup', (e) => heldKeys.delete(e.code), true);
    window.addEventListener('blur', () => {heldKeys.clear();manualWeaponSwapRequestedAt=-Infinity;});
    document.addEventListener('fpsarena-aim:config', (e) => {
      try { options = normaliseOptions(JSON.parse(e.detail)); faultEpoch++; lastTargetId = null; emit('status', { state: 'ready', message: 'Settings applied', enabled: options.enabled, tracking: false }); }
      catch (_) { postStatus('error', 'Invalid settings'); }
    });
    document.addEventListener('fpsarena-aim:ping', () => postStatus('ready', 'Connected'));
    postStatus('ready', 'Connected to FPS Arena');
  } catch (err) {
    console.warn('[FPS Arena Aim]', err);
    postStatus('error', String(err?.message || err));
  }
})();
