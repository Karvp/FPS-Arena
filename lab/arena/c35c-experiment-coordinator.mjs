/**
 * FPS Arena C35-C2 — opt-in, SOURCE-INDEPENDENT integration boundary.
 * No C16/C21/C34 implementation is bundled here. Those functions are supplied
 * by the genuine simulator during wiring and never replaced by this module.
 * No fake server observations, firing suppression, or forced actuation.
 */
import { C35C_ARMS, C35COfferLedger, C35CPreofferAudit,
  decideC35CPreoffer, publicRiskBin, validateC35CConfig } from './c35c-option-arbitration.mjs';

const POLICY = Object.freeze(['legacy80', 'hierarchical80']);
const validId = x => typeof x === 'string' && x.length > 0;
const finiteNonnegative = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const positiveThreeWay = p => p !== null && typeof p === 'object' && !Array.isArray(p) &&
  C35C_ARMS.every(a => typeof p[a] === 'number' && Number.isFinite(p[a]) && p[a] > 0 && p[a] < 1) &&
  Math.abs(C35C_ARMS.reduce((s, a) => s + p[a], 0) - 1) <= 1e-9;

/** Legacy80 MUST delegate to the real C35-B code: no stand-in eligibility. */
function legacyDecision(packet, config, callback) {
  const fromC35B = callback(packet, config);
  if (!fromC35B || typeof fromC35B.eligible !== 'boolean' ||
      typeof fromC35B.reason !== 'string' || !fromC35B.reason)
    throw new TypeError('authentic C35-B preoffer returned invalid decision');
  if (fromC35B.eligible &&
      (!packet.symmetricC16 || C35C_ARMS.some(a => packet.symmetricC16[a] !== true)))
    throw new Error('legacy C35-B eligibility cannot override symmetric C16');
  return {
    ...fromC35B,
    durationMs: config.durationMs,
    windowMs: config.windowMs,
    riskBin: publicRiskBin(packet.threat,config,packet.nowMs),
    predecisionOnly: true,
    availableArms:fromC35B.eligible ? [...C35C_ARMS] : [],
    requiresAuthoritativePerTickC16:true,
  };
}

/**
 * A prospective attempt includes EVERY decision opportunity; only eligible
 * attempts generate a C21 assignment. blocked attempts never advance C21.
 * The caller MUST supply an honest public packet, original C16 outcome and
 * exact C21 function; an adapter cannot prove those are authentic in isolation.
 */
export class C35CExperimentCoordinator {
  #attemptIds = new Set();
  #offerIds = new Set();
  #active = new Map();
  #lastWindowEnd = new Map();
  #preoffers = new C35CPreofferAudit();
  #offers;
  #c21;
  #legacyPreoffer;
  #mode;
  #config;
  constructor({mode='hierarchical80', c21Assign, legacyPreoffer, config={}}={}) {
    if (!POLICY.includes(mode)) throw new RangeError('unknown policy');
    if (typeof c21Assign !== 'function') throw new TypeError('original C21 assignment callback is required');
    if (mode === 'legacy80' && typeof legacyPreoffer !== 'function')
      throw new TypeError('legacy80 requires the genuine C35-B preoffer callback');
    this.#config = validateC35CConfig({...config,durationMs:80});
    this.#mode=mode;
    this.#c21=c21Assign;
    this.#legacyPreoffer=legacyPreoffer;
    this.#offers=new C35COfferLedger({windowMs:this.#config.windowMs});
  }
  get mode(){return this.#mode;}
  attempt({attemptId, offerId, matchId, setupId, packet, ordinal}) {
    if (![attemptId,matchId,setupId].every(validId) ||
        !finiteNonnegative(packet?.nowMs) || !Number.isSafeInteger(ordinal) || ordinal < 0)
      throw new TypeError('invalid preoffer identification or ordinal');
    if (this.#attemptIds.has(attemptId)) throw new Error('duplicate attempt id');
    const decision=this.#mode === 'hierarchical80'
      ? decideC35CPreoffer(packet,this.#config)
      : legacyDecision(packet,this.#config,this.#legacyPreoffer);
    const nowMs=packet.nowMs;
    const audit=this.#preoffers.record({attemptId,matchId,setupId,nowMs,decision});
    this.#attemptIds.add(attemptId);
    if (!decision.eligible) return {status:'blocked',reason:decision.reason,riskBin:decision.riskBin,
      attemptId,policy:this.#mode};
    // The original C35B window invariant must be checked before C21, so an
    // overlapping offer cannot accidentally consume a randomization ordinal.
    const lastEnd=this.#lastWindowEnd.get(matchId) ?? -Infinity;
    if (nowMs < lastEnd) return {status:'deferred-window',reason:'nonoverlap',attemptId,policy:this.#mode};
    if (!validId(offerId) || this.#offerIds.has(offerId)) throw new Error('duplicate/missing offerId');
    const assigned=this.#c21({attemptId,matchId,setupId,ordinal,
      eligibleArms:[...C35C_ARMS]});
    if (!assigned || !C35C_ARMS.includes(assigned.arm) || !positiveThreeWay(assigned.propensity))
      throw new Error('C21 must return an arm and all three original positive propensities');
    this.#offers.recordAssignment({offerId,attemptId,policy:this.#mode,matchId,setupId,
      startMs:nowMs,assignment:assigned.arm,decision,
      propensity:assigned.propensity});
    this.#offerIds.add(offerId);
    this.#lastWindowEnd.set(matchId,nowMs+this.#config.windowMs);
    this.#active.set(offerId,{assignment:assigned.arm,attemptId,matchId,setupId,
      startMs:nowMs,endMs:nowMs+this.#config.durationMs,closed:false,
      lastTickMs:-Infinity,executedTicks:0,interruptReason:null});
    return {status:'assigned',offerId,attemptId,policy:this.#mode,arm:assigned.arm,
      riskBin:decision.riskBin,durationMs:this.#config.durationMs};
  }
  /**
   * MUST be called before each requested strafe tick. The authority callbacks
   * return true only if original simulator C16 and macro command BOTH permit
   * this tick. Returning a diagnostic does not actuate; only `applyMicroTick`
   * writes movement. Fire/reload/skill/objective/emergency are untouched.
   */
  tick({offerId,nowMs,isC16Safe,isMacroFree,applyMicroTick}) {
    const state=this.#active.get(offerId);
    if (!state || state.closed) throw new Error('no open offer');
    if (!finiteNonnegative(nowMs) || nowMs < state.lastTickMs || nowMs < state.startMs)
      throw new RangeError('invalid or backwards tick');
    state.lastTickMs=nowMs;
    if (state.assignment==='baseline') return {status:'baseline-untouched'};
    if (state.interruptReason!==null) return {status:'interrupted',reason:state.interruptReason};
    if (nowMs >= state.endMs) return {status:'dose-ended'};
    if (typeof isC16Safe !== 'function' || typeof isMacroFree !== 'function' ||
        typeof applyMicroTick !== 'function') throw new TypeError('authoritative callbacks required');
    // Strict safety ordering: C16 can veto; the macro can veto independently.
    // Neither veto may be overridden by the micro controller.
    if (isC16Safe({offerId,nowMs,arm:state.assignment}) !== true) {
      state.interruptReason='authoritative-c16-refusal';
      return {status:'interrupted',reason:state.interruptReason};
    }
    if (isMacroFree({offerId,nowMs,arm:state.assignment}) !== true) {
      state.interruptReason='incumbent-priority-command';
      return {status:'interrupted',reason:state.interruptReason};
    }
    applyMicroTick({offerId,nowMs,arm:state.assignment});
    state.executedTicks++;
    return {status:'executed',executedTicks:state.executedTicks};
  }
  /** Actual server outcomes are provided only by game integration after play. */
  finalize({offerId, completed, plannedTicks, hostileHits=null,hitPositive=null,
    shotsFired=null,shotsLost=null,damageTaken=null,damageDealt=null}) {
    const state=this.#active.get(offerId);
    if (!state || state.closed) throw new Error('unknown or already finalized offer');
    const row=this.#offers.recordPostdecision({offerId,completed,
      executedTicks:state.executedTicks,plannedTicks,
      interruptReason:state.interruptReason,hitPositive,hostileHits,
      shotsFired,shotsLost,damageTaken,damageDealt,measurementSource:'server-after-action'});
    state.closed=true;
    this.#active.delete(offerId);
    return row;
  }
  preofferRows(){return this.#preoffers.rows().map(r=>({...r,policy:this.#mode}));}
  offerRows(){return this.#offers.rows();}
  pendingCount(){return this.#offers.pendingCount();}
}
export const C35C_POLICY_IDS=POLICY;
