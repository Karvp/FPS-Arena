/**
 * FPS Arena v2.9.11 — C35-C research-only, public-information option arbiter.
 *
 * Integration contract (NOT a replacement for C16 or C21):
 * 1. Build exactly one predecision packet from public/local state before the C21
 *    random assignment. No server-only data, no retrospective interruption cause.
 * 2. Call decidePreoffer(packet); blocked offers receive no assignment.
 * 3. If eligible, run the EXISTING symmetric C16 check and the EXISTING C21
 *    three-way hash assignment; all three arms must retain positive probability.
 * 4. Recheck authoritative C16 every tick; never force a micro-action to finish.
 * 5. Record server outcomes ONLY after action assignment and window completion.
 *
 * This module never emits game controls or overrides firing/emergency priority.
 */

export const C35C_ARMS = Object.freeze(['baseline', 'micro-left', 'micro-right']);
export const C35C_DEFAULTS = Object.freeze({
  durationMs: 80,
  windowMs: 1800,
  maxSnapshotAgeMs: 170,
  priorityGuardMs: 40,
  acceptedMacroKinds: Object.freeze(['engage', 'navigate', 'cover', 'loot', 'rotate']),
  // Quantile-like *fixed engineering bins*, NOT calibrated hit probabilities.
  publicThreatThresholds: Object.freeze([1 / 3, 2 / 3]),
});

const isPlain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function validateC35CConfig(input = {}) {
  if (!isPlain(input)) throw new TypeError('config must be a plain object');
  const config = { ...C35C_DEFAULTS, ...input };
  if (![80, 120, 160].includes(config.durationMs)) throw new RangeError('durationMs must be 80, 120, or 160');
  for (const key of ['windowMs', 'maxSnapshotAgeMs', 'priorityGuardMs']) {
    if (!finite(config[key]) || config[key] < 0) throw new RangeError(`${key} must be a nonnegative finite number`);
  }
  if (config.windowMs <= config.durationMs) throw new RangeError('windowMs must exceed durationMs');
  if (!Array.isArray(config.acceptedMacroKinds) || !config.acceptedMacroKinds.every(v => typeof v === 'string')) {
    throw new TypeError('acceptedMacroKinds must be string array');
  }
  if (!Array.isArray(config.publicThreatThresholds) || config.publicThreatThresholds.length !== 2 ||
      config.publicThreatThresholds.some(v => !finite(v) || v <= 0 || v >= 1) ||
      config.publicThreatThresholds[0] >= config.publicThreatThresholds[1]) {
    throw new TypeError('publicThreatThresholds must be two ordered values between 0 and 1');
  }
  return Object.freeze({
    ...config,
    acceptedMacroKinds: Object.freeze([...config.acceptedMacroKinds]),
    publicThreatThresholds: Object.freeze([...config.publicThreatThresholds]),
  });
}

/** A descriptive stratum; NEVER use this label to discard an assigned outcome. */
export function publicRiskBin(threat, config = C35C_DEFAULTS, nowMs = undefined) {
  if (!isPlain(threat) || threat.source !== 'public-c34' ||
      !finite(threat.score) || threat.score < 0 || threat.score > 1 ||
      !finite(threat.observedAtMs)) return 'unknown';
  if (finite(nowMs) && (threat.observedAtMs > nowMs ||
    nowMs - threat.observedAtMs > config.maxSnapshotAgeMs)) return 'unknown';
  const [lo, hi] = config.publicThreatThresholds;
  return threat.score < lo ? 'low' : threat.score < hi ? 'middle' : 'high';
}

/**
 * Packet is constructed BEFORE randomization and action execution.
 * packet: {
 *   nowMs, publicSnapshot: {observedAtMs},
 *   incumbent: {source:"public-local",fire,reload,skill,objective,emergency},
 *   macro: {source:"public-prediction",kind,nextPriorityEtaMs}, // BEFORE offer
 *   symmetricC16: {'baseline':boolean,'micro-left':boolean,'micro-right':boolean},
 *   threat: {source:'public-c34',score:[0,1],observedAtMs} | null
 * }
 */
export function decideC35CPreoffer(packet, userConfig = {}) {
  const config = validateC35CConfig(userConfig);
  const no = reason => Object.freeze({ eligible: false, reason, durationMs: config.durationMs,
    availableArms: Object.freeze([]),
    riskBin: publicRiskBin(packet?.threat, config, packet?.nowMs), predecisionOnly: true });
  if (!isPlain(packet) || !finite(packet.nowMs) || packet.nowMs < 0) return no('malformed-public-packet');
  const { nowMs } = packet;
  if (!isPlain(packet.publicSnapshot) || !finite(packet.publicSnapshot.observedAtMs) ||
      packet.publicSnapshot.observedAtMs > nowMs ||
      nowMs - packet.publicSnapshot.observedAtMs > config.maxSnapshotAgeMs) return no('stale-or-incomplete-public-snapshot');
  const incumbent = packet.incumbent;
  if (!isPlain(incumbent) || incumbent.source !== 'public-local' ||
      !['fire','reload','skill','objective','emergency'].every(k => typeof incumbent[k] === 'boolean')) {
    return no('unknown-incumbent-command');
  }
  if (incumbent.emergency || incumbent.fire || incumbent.reload || incumbent.skill || incumbent.objective) {
    return no('incumbent-priority-command');
  }
  if (!isPlain(packet.macro) || packet.macro.source !== 'public-prediction' ||
      !config.acceptedMacroKinds.includes(packet.macro.kind) ||
      !finite(packet.macro.nextPriorityEtaMs) || packet.macro.nextPriorityEtaMs < 0) {
    return no('macro-priority-forecast-unavailable');
  }
  if (packet.macro.nextPriorityEtaMs < config.durationMs + config.priorityGuardMs) {
    return no('macro-transition-imminent');
  }
  const c16 = packet.symmetricC16;
  if (!isPlain(c16) || C35C_ARMS.some(arm => !own(c16, arm) || c16[arm] !== true)) {
    return no('c16-symmetric-safety-refusal');
  }
  // C34 risk score only contributes a descriptive stratum. Its availability
  // cannot change eligibility or assignment probability (preserve positivity).
  return Object.freeze({
    eligible: true,
    reason: 'predecision-clear',
    durationMs: config.durationMs,
    windowMs: config.windowMs,
    availableArms: C35C_ARMS,
    riskBin: publicRiskBin(packet.threat, config, nowMs),
    priorityGuardMs: config.priorityGuardMs,
    predecisionOnly: true,
    requiresAuthoritativePerTickC16: true,
  });
}

/**
 * A deliberately strict research ledger. C21 must supply assignment; this
 * NEVER replaces or reseeds the historical C21 arm randomizer.
 */
export class C35COfferLedger {
  #pending = new Map();
  #lastWindowEnd = new Map();
  #rows = [];
  constructor({windowMs = 1800} = {}) {
    if (!finite(windowMs) || windowMs <= 0) throw new TypeError('invalid windowMs');
    this.windowMs = windowMs;
  }
  recordAssignment({offerId, attemptId = null, policy = null, matchId, setupId, startMs, assignment, decision, propensity}) {
    if (![offerId, matchId, setupId].every(x => typeof x === 'string' && x.length > 0)) {
      throw new TypeError('nonempty offerId/matchId/setupId required');
    }
    if (!finite(startMs) || startMs < 0) throw new RangeError('startMs invalid');
    if (attemptId !== null && (typeof attemptId !== 'string' || !attemptId)) throw new TypeError('invalid attemptId');
    if (policy !== null && !['legacy80', 'hierarchical80', 'predictive80'].includes(policy)) throw new TypeError('invalid policy');
    if (this.#pending.has(offerId) || this.#rows.some(row => row.offerId === offerId)) throw new Error('duplicate offerId');
    if (!decision || decision.eligible !== true || !C35C_ARMS.includes(assignment)) throw new Error('invalid eligibility/assignment');
    if (!Array.isArray(decision.availableArms) || C35C_ARMS.some(a => !decision.availableArms.includes(a))) {
      throw new Error('all three arms required');
    }
    if (!isPlain(propensity) || C35C_ARMS.some(a => !finite(propensity[a]) || propensity[a] <= 0 || propensity[a] >= 1)) {
      throw new Error('positive propensities required for all arms');
    }
    const total = C35C_ARMS.reduce((s, a) => s + propensity[a], 0);
    if (Math.abs(total - 1) > 1e-9) throw new Error('propensities must sum to 1');
    const lastEnd = this.#lastWindowEnd.get(matchId) ?? -Infinity;
    if (startMs < lastEnd) throw new Error('overlapping outcome windows');
    const windowEndMs = startMs + this.windowMs;
    this.#lastWindowEnd.set(matchId, windowEndMs);
    this.#pending.set(offerId, Object.freeze({
      schema: 'fpsarena-c35c-offer-v1', offerId, ...(attemptId !== null ? {attemptId} : {}),
      ...(policy !== null ? {policy} : {}), matchId, setupId, startMs,
      windowEndMs, assignment, propensity: Object.freeze({...propensity}),
      riskBin: decision.riskBin, durationMs: decision.durationMs,
      predecisionOnly: true,
    }));
  }
  recordPostdecision({offerId, completed, executedTicks, plannedTicks, interruptReason = null,
    hitPositive = null, hostileHits = null, shotsFired = null, shotsLost = null,
    damageTaken = null, damageDealt = null, measurementSource = 'server-after-action'}) {
    const initial = this.#pending.get(offerId);
    if (!initial) throw new Error('unknown or finalized offerId');
    if (measurementSource !== 'server-after-action') throw new Error('outcome must be supplied after assignment from server truth');
    if (typeof completed !== 'boolean') throw new Error('completed flag required');
    if (![executedTicks, plannedTicks].every(x => Number.isInteger(x) && x >= 0) || executedTicks > plannedTicks) {
      throw new Error('invalid execution tick counts');
    }
    if (initial.assignment === 'baseline' && interruptReason !== null) throw new Error('baseline has no micro interruption');
    if (interruptReason !== null && (typeof interruptReason !== 'string' || !interruptReason)) throw new Error('bad interruption cause');
    for (const [name, value] of Object.entries({hostileHits, shotsFired, shotsLost, damageTaken, damageDealt})) {
      if (value !== null && (!finite(value) || value < 0)) throw new Error(`invalid ${name}`);
    }
    if (completed && (typeof hitPositive !== 'boolean' || !Number.isInteger(hostileHits))) {
      throw new Error('complete window requires observed outcome');
    }
    if (!completed && (hitPositive !== null || hostileHits !== null)) {
      throw new Error('censored window must not be treated as observed zero hits');
    }
    if (completed && hitPositive !== (hostileHits > 0)) throw new Error('hitPositive contradicts hostileHits');
    const row = Object.freeze({
      ...initial, complete: completed, censored: !completed,
      executedTicks, plannedTicks, interruptReason,
      outcome: Object.freeze({
        hitPositive, hostileHits, shotsFired, shotsLost, damageTaken, damageDealt,
        source: measurementSource,
      }),
    });
    this.#pending.delete(offerId);
    this.#rows.push(row);
    return row;
  }
  rows() { return this.#rows.map(row => structuredClone(row)); }
  pendingCount() { return this.#pending.size; }
}


/** Counts the prospective denominator including blocked attempts.
 * Emission must occur BEFORE the C21 randomizer and independent of outcome.
 */
export class C35CPreofferAudit {
  #ids = new Set();
  #rows = [];
  record({attemptId, matchId, setupId, nowMs, decision}) {
    if (![attemptId, matchId, setupId].every(x => typeof x === 'string' && x.length > 0)) {
      throw new TypeError('nonempty attemptId/matchId/setupId required');
    }
    if (!finite(nowMs) || nowMs < 0) throw new RangeError('bad nowMs');
    if (this.#ids.has(attemptId)) throw new Error('duplicate attemptId');
    if (!decision || typeof decision.eligible !== 'boolean' ||
        typeof decision.reason !== 'string' || !['low','middle','high','unknown'].includes(decision.riskBin)) {
      throw new TypeError('invalid predecision decision');
    }
    if (decision.eligible && C35C_ARMS.some(a => !decision.availableArms.includes(a))) {
      throw new Error('eligible predecision must preserve three-way assignment');
    }
    const row=Object.freeze({schema:'fpsarena-c35c-preoffer-v1', attemptId, matchId,
      setupId, nowMs, eligible:decision.eligible, predecisionReason:decision.reason,
      riskBin:decision.riskBin, predecisionOnly:true,
      ...(decision.predictedPriorityRisk120ms===null||decision.predictedPriorityRisk120ms===undefined?{}:
       {predictedPriorityRisk120ms:decision.predictedPriorityRisk120ms})});
    this.#ids.add(attemptId); this.#rows.push(row); return row;
  }
  rows() {return this.#rows.map(row=>({...row}));}
}
