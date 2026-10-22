// THE weapon table. Every gameplay value lives here and is used by BOTH server (truth) and client (prediction/UI).
// dmg:[near,far] interpolated across range:[nearRange,farRange]. Spreads/recoil in degrees. Times in seconds.
import { PLAYER } from './constants.js';

const D = {
  headMul: 1.3, pellets: 1, auto: true, adsMove: 0.7, adsTime: 0.22, adsFov: 52,
  spreadHip: 2.0, spreadAds: 0.2, recoilV: 0.5, recoilH: 0.2, infinite: false, shellReload: 0,
  sniper: false, burst: 0, burstGap: 0, tracerRange: 150, maxRange: 200, len: 0.85, move: 1, sightDrop: 0.012, color: 0xffe9a0,
};
function W(id, name, cat, o) {
  const w = { ...D, ...o, id, name, cat };
  w.file = `assets/models/${o.file || id}.glb`;
  w.rpm = Math.round(60 / (w.burst ? w.burstGap : w.interval));      // cyclic rate (inside a burst)
  return w;
}

export const WEAPONS = {};
const add = (...ws) => ws.forEach(w => (WEAPONS[w.id] = w));

add(
  // ---------- ASSAULT RIFLES ----------
  W('m4a1', 'M4A1', 'Assault Rifle', { dmg: [26, 20], range: [25, 60], interval: 0.085, magSize: 32, reload: 2.1, move: 0.95, adsTime: 0.22, spreadHip: 1.8, spreadAds: 0.18, recoilV: 0.5, recoilH: 0.18, len: 0.85, desc: 'Fast, balanced carbine. Controllable recoil and a big 32-round magazine.' }),
  W('akm', 'AKM', 'Assault Rifle', { dmg: [31, 25], range: [22, 55], interval: 0.105, magSize: 30, reload: 2.4, move: 0.9, adsTime: 0.26, adsMove: 0.65, spreadHip: 2.4, spreadAds: 0.25, recoilV: 0.85, recoilH: 0.35, len: 0.88, desc: 'Hard-hitting classic. Heavy recoil and slower movement.' }),
  W('fn_scar', 'FN SCAR-L', 'Assault Rifle', { dmg: [30, 24], range: [25, 65], interval: 0.098, magSize: 30, reload: 2.3, move: 0.92, adsTime: 0.25, spreadHip: 2.1, spreadAds: 0.2, recoilV: 0.68, recoilH: 0.24, len: 0.88, desc: 'Balanced-to-heavy battle rifle behaviour with solid range.' }),
  W('qbz192', 'QBZ-192', 'Assault Rifle', { dmg: [24, 18], range: [25, 60], interval: 0.08, magSize: 30, reload: 2.0, move: 0.97, adsTime: 0.2, spreadHip: 1.7, spreadAds: 0.17, recoilV: 0.5, recoilH: 0.2, len: 0.82, desc: 'Compact and mobile bullpup-style rifle.' }),
  W('honey_badger', 'Honey Badger', 'Assault Rifle', { dmg: [22, 16], range: [20, 50], interval: 0.07, magSize: 30, reload: 1.9, move: 1.0, adsTime: 0.19, spreadHip: 1.6, spreadAds: 0.16, recoilV: 0.42, recoilH: 0.22, len: 0.72, desc: 'Very mobile PDW-style rifle with an extremely fast fire rate.' }),
  W('beryl', 'Beryl', 'Assault Rifle', { dmg: [33, 26], range: [22, 58], interval: 0.115, magSize: 30, reload: 2.4, move: 0.9, adsTime: 0.26, adsMove: 0.65, spreadHip: 2.4, spreadAds: 0.24, recoilV: 0.95, recoilH: 0.4, len: 0.88, desc: 'High damage per bullet with strong recoil.' }),
  // ---------- SMGs ----------
  W('colt9mm', 'Colt 9mm', 'SMG', { dmg: [20, 11], range: [12, 32], interval: 0.065, magSize: 32, reload: 1.7, move: 1.05, adsTime: 0.15, adsMove: 0.85, spreadHip: 2.6, spreadAds: 0.45, recoilV: 0.34, recoilH: 0.2, len: 0.62, maxRange: 120, desc: 'Ultra-mobile SMG. Short effective range.' }),
  W('mp5sd', 'MP5SD', 'SMG', { dmg: [21, 12], range: [14, 34], interval: 0.07, magSize: 30, reload: 1.8, move: 1.03, adsTime: 0.16, adsMove: 0.85, spreadHip: 2.3, spreadAds: 0.35, recoilV: 0.3, recoilH: 0.16, len: 0.62, maxRange: 120, desc: 'Suppressed SMG. Smooth and accurate up close.' }),
  W('mpx', 'SIG MPX', 'SMG', { dmg: [22, 13], range: [13, 34], interval: 0.06, magSize: 30, reload: 1.8, move: 1.04, adsTime: 0.16, adsMove: 0.85, spreadHip: 2.5, spreadAds: 0.4, recoilV: 0.33, recoilH: 0.2, len: 0.6, maxRange: 120, desc: 'High fire rate SMG for aggressive play.' }),
  W('aug_para', 'AUG Para', 'SMG', { dmg: [23, 15], range: [15, 38], interval: 0.068, magSize: 32, reload: 1.9, move: 1.02, adsTime: 0.17, adsMove: 0.85, spreadHip: 2.2, spreadAds: 0.3, recoilV: 0.3, recoilH: 0.15, len: 0.6, maxRange: 130, desc: 'Bullpup SMG with the best range of its class.' }),
  W('apc9', 'APC9', 'SMG', { dmg: [21, 12], range: [13, 32], interval: 0.062, magSize: 30, reload: 1.7, move: 1.05, adsTime: 0.15, adsMove: 0.85, spreadHip: 2.6, spreadAds: 0.42, recoilV: 0.32, recoilH: 0.2, len: 0.6, maxRange: 120, desc: 'Lightweight SMG, fast handling.' }),
  W('scorpion_evo3', 'Scorpion EVO 3', 'SMG', { dmg: [19, 10], range: [12, 30], interval: 0.055, magSize: 30, reload: 1.7, move: 1.06, adsTime: 0.14, adsMove: 0.88, spreadHip: 2.8, spreadAds: 0.5, recoilV: 0.36, recoilH: 0.24, len: 0.55, maxRange: 110, desc: 'Fastest fire rate in the game, lowest damage.' }),
  // ---------- SNIPERS ----------
  W('l115a3', 'L115A3', 'Sniper', { dmg: [95, 85], range: [40, 120], interval: 1.45, magSize: 5, reload: 3.4, move: 0.85, auto: false, sniper: true, headMul: 100, adsTime: 0.36, adsFov: 14, adsMove: 0.55, spreadHip: 6, spreadAds: 0.0, recoilV: 2.2, recoilH: 0.4, len: 1.25, sightDrop: 0.03, tracerRange: 250, maxRange: 400, desc: 'Bolt-action. One shot to the head is always lethal. Massive ADS zoom.' }),
  W('wa2000', 'WA2000', 'Sniper', { dmg: [80, 70], range: [35, 110], interval: 0.75, magSize: 6, reload: 3.0, move: 0.88, auto: false, sniper: true, headMul: 100, adsTime: 0.3, adsFov: 18, adsMove: 0.6, spreadHip: 5, spreadAds: 0.0, recoilV: 1.5, recoilH: 0.3, len: 1.1, sightDrop: 0.03, tracerRange: 250, maxRange: 400, desc: 'Semi-auto sniper with fast follow-up shots.' }),
  // ---------- LMGs ----------
  W('m249', 'M249 SAW', 'LMG', { dmg: [24, 20], range: [25, 65], interval: 0.075, magSize: 100, reload: 6.0, move: 0.8, adsTime: 0.34, adsMove: 0.5, spreadHip: 2.8, spreadAds: 0.3, recoilV: 0.5, recoilH: 0.3, len: 1.0, desc: '100 rounds of suppression. Slow and heavy.' }),
  W('rpd', 'RPD', 'LMG', { dmg: [27, 22], range: [25, 65], interval: 0.095, magSize: 75, reload: 5.2, move: 0.82, adsTime: 0.32, adsMove: 0.5, spreadHip: 2.7, spreadAds: 0.28, recoilV: 0.62, recoilH: 0.3, len: 1.0, desc: '75-round drum, harder-hitting than the SAW.' }),
  // ---------- MARKSMAN ----------
  W('svt40', 'SVT-40', 'Marksman', { dmg: [58, 48], range: [35, 90], interval: 0.2, magSize: 10, reload: 2.6, move: 0.92, auto: false, adsTime: 0.27, adsFov: 38, adsMove: 0.65, spreadHip: 3.2, spreadAds: 0.08, recoilV: 1.1, recoilH: 0.3, len: 1.05, tracerRange: 200, maxRange: 300, desc: 'Semi-auto battle rifle. Two to three shots to kill.' }),
  W('m1_garand', 'M1 Garand', 'Marksman', { dmg: [65, 52], range: [40, 90], interval: 0.32, magSize: 8, reload: 2.8, move: 0.93, auto: false, adsTime: 0.28, adsFov: 40, adsMove: 0.65, spreadHip: 3.4, spreadAds: 0.06, recoilV: 1.2, recoilH: 0.3, len: 1.1, tracerRange: 200, maxRange: 300, desc: 'Powerful 8-round en-bloc semi-auto.' }),
  W('hk_sl8', 'HK SL8', 'Marksman', { dmg: [50, 42], range: [35, 85], interval: 0.16, magSize: 20, reload: 2.4, move: 0.95, auto: false, adsTime: 0.24, adsFov: 36, adsMove: 0.68, spreadHip: 2.9, spreadAds: 0.06, recoilV: 0.85, recoilH: 0.22, len: 0.9, tracerRange: 200, maxRange: 300, desc: 'Fast semi-auto DMR with a 20-round magazine.' }),
  // ---------- SHOTGUNS ----------
  W('cz_drake', 'CZ Drake', 'Shotgun', { dmg: [17, 3], range: [4, 18], interval: 0.35, magSize: 2, reload: 0, shellReload: 0.55, pellets: 10, move: 0.97, auto: false, adsTime: 0.2, adsFov: 58, adsMove: 0.8, spreadHip: 4.2, spreadAds: 2.6, recoilV: 2.4, recoilH: 0.5, len: 0.9, tracerRange: 30, maxRange: 30, desc: 'Double-barrel. Devastating up close, useless at range.' }),
  W('benelli_m4', 'Benelli M4', 'Shotgun', { dmg: [15, 3], range: [5, 20], interval: 0.45, magSize: 8, reload: 0, shellReload: 0.5, pellets: 10, move: 0.95, auto: false, adsTime: 0.22, adsFov: 58, adsMove: 0.78, spreadHip: 4.0, spreadAds: 2.4, recoilV: 1.9, recoilH: 0.45, len: 0.95, tracerRange: 32, maxRange: 32, desc: 'Semi-auto shotgun with shell-by-shell loading.' }),
  // ---------- SPECIAL ----------
  W('laser_rifle', 'Laser Rifle', 'Special', { file: 'laser_rifle', dmg: [9, 7], range: [30, 80], interval: 0.045, magSize: 1, reload: 0, infinite: true, move: 1.0, adsTime: 0.18, adsFov: 55, adsMove: 0.85, spreadHip: 1.2, spreadAds: 0.1, recoilV: 0.02, recoilH: 0.01, len: 0.8, tracerRange: 200, maxRange: 250, color: 0x40e0ff, desc: 'Infinite ammo, no reload, near-zero recoil. Low damage per shot.' }),
);


// ---------------------------------------------------------------------------------------------------------------------
// Extra weapon pack. Class baselines keep the table short; every weapon overrides what makes it different.
// burst:n = one trigger pull fires n rounds (burstGap seconds apart), then `interval` seconds until the next burst.
const AR = { dmg: [26, 20], range: [25, 60], interval: 0.09, magSize: 30, reload: 2.2, move: 0.94, adsTime: 0.23, spreadHip: 2.0, spreadAds: 0.2, recoilV: 0.6, recoilH: 0.22, len: 0.85 };
const SMG = { dmg: [21, 12], range: [14, 34], interval: 0.068, magSize: 30, reload: 1.8, move: 1.03, adsTime: 0.16, adsMove: 0.85, spreadHip: 2.4, spreadAds: 0.38, recoilV: 0.32, recoilH: 0.18, len: 0.6, maxRange: 130 };
const DMR = { dmg: [55, 45], range: [35, 90], interval: 0.2, magSize: 15, reload: 2.5, move: 0.93, auto: false, adsTime: 0.26, adsFov: 38, adsMove: 0.65, spreadHip: 3, spreadAds: 0.07, recoilV: 1, recoilH: 0.28, len: 1, tracerRange: 200, maxRange: 300 };
const SNP = { dmg: [95, 85], range: [40, 120], interval: 1.3, magSize: 5, reload: 3.2, move: 0.85, auto: false, sniper: true, headMul: 100, adsTime: 0.34, adsFov: 14, adsMove: 0.55, spreadHip: 6, spreadAds: 0, recoilV: 2, recoilH: 0.35, len: 1.2, sightDrop: 0.03, tracerRange: 250, maxRange: 400 };
const SHT = { dmg: [15, 3], range: [5, 20], pellets: 10, interval: 0.5, magSize: 6, shellReload: 0.55, move: 0.96, auto: false, adsTime: 0.22, adsFov: 58, adsMove: 0.78, spreadHip: 4.2, spreadAds: 2.5, recoilV: 2, recoilH: 0.45, len: 0.95, tracerRange: 32, maxRange: 32 };
const PST = { dmg: [22, 12], range: [10, 28], interval: 0.15, magSize: 8, reload: 1.4, move: 1.08, auto: false, adsTime: 0.12, adsFov: 56, adsMove: 0.95, spreadHip: 2.0, spreadAds: 0.25, recoilV: 0.8, recoilH: 0.25, len: 0.21, sightDrop: 0.008, maxRange: 100, tracerRange: 100 };
const X = (b, o) => ({ ...b, ...o });
add(
  // ---------- ASSAULT RIFLES ----------
  W('a545', 'A-545', 'Assault Rifle', X(AR, { dmg: [25, 19], interval: 0.082, recoilV: 0.52, move: 0.96, desc: 'Modern AK derivative. Fast and very controllable.' })),
  W('ak74', 'AK-74', 'Assault Rifle', X(AR, { dmg: [27, 21], interval: 0.092, recoilV: 0.62, recoilH: 0.28, desc: 'Reliable 5.45 mm rifle with a mild kick.' })),
  W('ak109', 'AK-109', 'Assault Rifle', X(AR, { dmg: [32, 26], interval: 0.108, reload: 2.4, move: 0.91, adsMove: 0.65, recoilV: 0.85, recoilH: 0.36, desc: '7.62 mm AK. Hard-hitting, heavy recoil.' })),
  W('aek972', 'AEK-972', 'Assault Rifle', X(AR, { dmg: [29, 23], interval: 0.1, recoilV: 0.66, adsTime: 0.24, desc: 'Balanced-recoil Kalashnikov with solid damage.' })),
  W('m16a4', 'M16A4', 'Assault Rifle', X(AR, { dmg: [30, 25], range: [30, 70], burst: 3, burstGap: 0.055, interval: 0.34, auto: false, recoilV: 0.7, recoilH: 0.2, len: 0.95, desc: '3-round burst rifle. Precise at range; fire in controlled bursts.' })),
  W('acr', 'Bushmaster ACR', 'Assault Rifle', X(AR, { dmg: [26, 21], interval: 0.088, recoilV: 0.5, spreadAds: 0.17, move: 0.95, desc: 'Modular rifle with tight ADS accuracy.' })),
  W('bren', 'CZ 805 Bren', 'Assault Rifle', X(AR, { dmg: [27, 22], range: [26, 62], interval: 0.09, recoilV: 0.55, desc: 'All-rounder with good range.' })),
  W('fnc', 'FN FNC', 'Assault Rifle', X(AR, { dmg: [25, 19], interval: 0.085, recoilV: 0.55, desc: 'Light, quick-handling rifle.' })),
  W('hk33', 'HK33', 'Assault Rifle', X(AR, { dmg: [26, 20], interval: 0.088, magSize: 25, reload: 2.1, recoilV: 0.52, desc: 'Compact battle rifle, 25-round magazine.' })),
  W('hk416', 'HK416', 'Assault Rifle', X(AR, { dmg: [27, 21], interval: 0.084, reload: 2.1, recoilV: 0.46, recoilH: 0.16, adsTime: 0.22, desc: 'The most stable rifle of its class.' })),
  W('g36c', 'HK G36C', 'Assault Rifle', X(AR, { dmg: [23, 17], range: [20, 50], interval: 0.076, move: 0.98, adsTime: 0.2, recoilV: 0.45, len: 0.75, desc: 'Compact carbine. Mobile with lower range.' })),
  W('ace32', 'IWI ACE 32', 'Assault Rifle', X(AR, { dmg: [28, 22], interval: 0.096, recoilV: 0.6, desc: 'Strong mid-range rifle.' })),
  W('ac556', 'Ruger AC-556', 'Assault Rifle', X(AR, { dmg: [24, 18], interval: 0.07, move: 0.97, recoilV: 0.5, recoilH: 0.3, desc: 'Very high fire rate, a bit wild.' })),
  W('stg940', 'StG-940', 'Assault Rifle', X(AR, { dmg: [28, 22], interval: 0.094, recoilV: 0.62, desc: 'Steady, hard-ish hitting rifle.' })),
  W('stg44', 'StG 44', 'Assault Rifle', X(AR, { dmg: [33, 26], range: [22, 56], interval: 0.12, reload: 2.5, move: 0.9, adsMove: 0.65, recoilV: 0.8, recoilH: 0.3, desc: 'Historic assault rifle. Slow, powerful rounds.' })),
  W('tar21', 'Tavor TAR-21', 'Assault Rifle', X(AR, { dmg: [26, 20], interval: 0.082, move: 0.97, adsTime: 0.2, recoilV: 0.48, len: 0.72, desc: 'Bullpup: compact and accurate.' })),
  W('qbz95', 'QBZ-95', 'Assault Rifle', X(AR, { dmg: [25, 19], interval: 0.085, move: 0.97, recoilV: 0.5, len: 0.72, desc: 'Bullpup with fast handling.' })),
  W('tkb408', 'TKB-408', 'Assault Rifle', X(AR, { dmg: [34, 27], interval: 0.125, magSize: 20, reload: 2.3, move: 0.91, adsMove: 0.65, recoilV: 0.75, len: 0.8, desc: '7.62 bullpup. Few but heavy rounds.' })),
  W('apc308', 'B&T APC-308', 'Assault Rifle', X(AR, { dmg: [31, 25], interval: 0.1, magSize: 25, reload: 2.2, recoilV: 0.72, desc: '.308 carbine: strong damage, firm recoil.' })),
  // ---------- SMGs ----------
  W('ar57', 'AR-57', 'SMG', X(SMG, { dmg: [20, 11], interval: 0.064, magSize: 50, reload: 2.0, move: 1.04, recoilV: 0.3, desc: '50-round SMG. Huge magazine, light bullets.' })),
  W('aek918g', 'AEK-918G', 'SMG', X(SMG, { dmg: [20, 11], interval: 0.058, recoilV: 0.36, recoilH: 0.22, desc: 'Very fast fire rate.' })),
  W('aek919k', 'AEK-919K', 'SMG', X(SMG, { dmg: [21, 12], interval: 0.066, desc: 'Controllable Kalashnikov SMG.' })),
  W('aks74u', 'AKS-74U', 'SMG', X(SMG, { dmg: [24, 14], range: [16, 38], interval: 0.08, move: 1.0, recoilV: 0.48, len: 0.7, desc: 'Short AK carbine; hits harder than most SMGs.' })),
  W('famae', 'Famae SAF', 'SMG', X(SMG, { dmg: [20, 12], interval: 0.07, desc: 'Light, easy-to-use SMG.' })),
  W('uzi', 'IMI Uzi', 'SMG', X(SMG, { dmg: [21, 12], interval: 0.075, magSize: 32, recoilV: 0.34, spreadHip: 2.6, len: 0.55, desc: 'Compact classic.' })),
  W('mp9', 'MP9', 'SMG', X(SMG, { dmg: [19, 11], interval: 0.06, move: 1.06, len: 0.5, desc: 'Tiny and fast.' })),
  W('pp93', 'PP-93', 'SMG', X(SMG, { dmg: [20, 11], interval: 0.066, move: 1.07, len: 0.45, desc: 'Machine pistol: the most mobile.' })),
  W('ppsh41', 'PPSh-41', 'SMG', X(SMG, { dmg: [23, 13], interval: 0.06, magSize: 71, reload: 3.2, move: 1.0, recoilV: 0.38, len: 0.7, desc: '71-round drum. Slow reload.' })),
  W('qcw05', 'QCW-05', 'SMG', X(SMG, { dmg: [20, 12], interval: 0.068, recoilV: 0.28, desc: 'Quiet, smooth PDW.' })),
  W('thompson', 'Thompson M1928', 'SMG', X(SMG, { dmg: [25, 14], range: [13, 32], interval: 0.088, reload: 2.2, move: 1.0, desc: 'Heavy .45 rounds.' })),
  W('ump45', 'UMP45', 'SMG', X(SMG, { dmg: [25, 15], range: [15, 36], interval: 0.09, magSize: 25, reload: 1.9, recoilV: 0.3, move: 1.02, desc: 'Hard-hitting .45 SMG.' })),
  // ---------- MARKSMAN ----------
  W('sks', 'SKS', 'Marksman', X(DMR, { dmg: [60, 50], interval: 0.24, magSize: 10, reload: 2.6, desc: 'Semi-auto carbine. Two to three shots to kill.' })),
  W('rfb', 'Kel-Tec RFB', 'Marksman', X(DMR, { dmg: [56, 46], interval: 0.17, magSize: 20, reload: 2.4, recoilV: 0.9, len: 0.85, move: 0.94, desc: 'Bullpup semi-auto DMR.' })),
  W('arx200', 'Beretta ARX200', 'Marksman', X(DMR, { dmg: [52, 43], interval: 0.15, magSize: 20, reload: 2.4, recoilV: 0.8, len: 0.9, desc: 'Fast-firing 7.62 battle rifle.' })),
  // ---------- SHOTGUNS ----------
  W('aa12', 'AA-12', 'Shotgun', X(SHT, { dmg: [11, 3], range: [4, 16], pellets: 8, interval: 0.15, auto: true, magSize: 20, shellReload: 0, reload: 3.2, move: 0.93, adsMove: 0.7, recoilV: 1.3, desc: 'Fully automatic shotgun. Shreds at close range.' })),
  W('ksg', 'Kel-Tec KSG', 'Shotgun', X(SHT, { dmg: [17, 3], interval: 0.75, magSize: 14, shellReload: 0.45, desc: 'Pump-action with a huge 14-shell capacity.' })),
  W('srm1216', 'SRM Model 1216', 'Shotgun', X(SHT, { dmg: [11, 3], range: [4, 17], pellets: 8, burst: 4, burstGap: 0.09, interval: 0.65, magSize: 16, shellReload: 0, reload: 3.8, recoilV: 1.6, move: 0.94, desc: '4-round burst shotgun. One pull empties four shells.' })),
  // ---------- SNIPERS ----------
  W('m82a1', 'Barrett M82A1', 'Sniper', X(SNP, { dmg: [110, 100], interval: 0.95, magSize: 10, reload: 3.6, move: 0.8, adsFov: 12, recoilV: 2.6, len: 1.3, desc: '.50 cal semi-auto anti-materiel rifle.' })),
  W('m200', 'CheyTac M200', 'Sniper', X(SNP, { dmg: [100, 90], interval: 1.5, magSize: 7, reload: 3.3, move: 0.83, adsFov: 12, desc: 'Long-range bolt action, 7 rounds.' })),
  W('ballista', 'FN Ballista', 'Sniper', X(SNP, { dmg: [95, 85], interval: 1.25, reload: 3.0, move: 0.86, len: 1.1, desc: 'Modular bolt-action with quick handling.' })),
  W('gm6', 'GM6 Lynx', 'Sniper', X(SNP, { dmg: [105, 95], interval: 1.0, reload: 3.4, move: 0.8, adsFov: 13, len: 0.95, desc: '.50 bullpup semi-auto sniper.' })),
  W('rs9', 'Haenel RS9', 'Sniper', X(SNP, { dmg: [95, 85], interval: 1.1, reload: 3.0, move: 0.86, adsFov: 15, len: 1.15, desc: 'Fast bolt action.' })),
  W('hecate', 'PGM Hecate II', 'Sniper', X(SNP, { dmg: [110, 100], interval: 1.6, magSize: 7, reload: 3.6, move: 0.8, adsFov: 11, len: 1.3, desc: 'Heavy .50 bolt-action. Slowest, strongest.' })),
  W('timberwolf', 'PGW Timberwolf', 'Sniper', X(SNP, { dmg: [100, 90], interval: 1.35, reload: 3.2, move: 0.84, adsFov: 13, desc: '.338 bolt-action.' })),
  // ---------- PISTOLS (secondary slot) ----------
  W('federov', 'Federov Avtomat', 'Assault Rifle', X(AR, { dmg: [34, 28], range: [24, 58], interval: 0.13, magSize: 25, reload: 2.6, move: 0.9, adsMove: 0.64, recoilV: 0.8, recoilH: 0.3, len: 1.0, desc: 'The very first assault rifle. Slow, heavy rounds.' })),
  // ---------- LMG ----------
  W('rpk', 'RPK', 'LMG', { dmg: [28, 22], range: [25, 65], interval: 0.1, magSize: 40, reload: 4.2, move: 0.86, adsTime: 0.3, adsMove: 0.55, spreadHip: 2.5, spreadAds: 0.25, recoilV: 0.6, recoilH: 0.28, len: 1.0, desc: 'Light machine gun with a long barrel and a 40-round magazine.' }),
  // ---------- MARKSMAN ----------
  W('svdk', 'SVDK', 'Marksman', X(DMR, { dmg: [74, 60], range: [40, 100], interval: 0.46, magSize: 10, reload: 2.8, move: 0.88, adsFov: 30, adsMove: 0.6, recoilV: 1.5, len: 1.15, desc: '9.3 mm semi-auto DMR. Two body shots kill.' })),
  // ---------- SHOTGUN ----------
  W('m26mass', 'M26 MASS', 'Shotgun', X(SHT, { dmg: [18, 3], range: [5, 22], pellets: 9, interval: 0.85, magSize: 5, shellReload: 0, reload: 2.5, move: 0.95, recoilV: 1.8, desc: 'Magazine-fed bolt-action shotgun, 5 shells.' })),
  // ---------- PISTOLS (sidearm slot) ----------
  W('g17', 'G17', 'Pistol', X(PST, { dmg: [20, 11], interval: 0.11, magSize: 17, reload: 1.5, recoilV: 0.7, desc: 'Accurate 17-round semi-auto.' })),
  W('p08', 'P08 Luger', 'Pistol', X(PST, { dmg: [23, 12], range: [10, 30], interval: 0.14, reload: 1.5, move: 1.07, recoilV: 0.85, desc: 'Classic 8-round pistol. Sharp and punchy.' })),
  W('rsh12', 'RSh-12', 'Pistol', X(PST, { dmg: [50, 32], range: [12, 32], interval: 0.5, magSize: 5, reload: 2.8, move: 1.0, adsMove: 0.9, recoilV: 2.4, recoilH: 0.5, len: 0.3, desc: 'Hand-cannon revolver. Huge damage, five shots, slow reload.' })),
  W('microuzi', 'Micro Uzi', 'Pistol', X(PST, { dmg: [7, 4], range: [8, 22], interval: 0.04, auto: true, magSize: 32, reload: 1.6, move: 1.06, spreadHip: 3.0, spreadAds: 0.6, recoilV: 0.28, recoilH: 0.28, len: 0.3, desc: 'Automatic machine pistol: extremely fast but very low damage per bullet.' })),
  W('makarov', 'Makarov', 'Pistol', X(PST, { desc: 'Standard sidearm: light, quick to draw, 8 rounds.' })),
  // Melee sidearm: no ammo, one swing every 750 ms, 75 damage to the enemy in front of you. Not lootable (it is a loadout sidearm).
  W('knife', 'Combat Knife', 'Pistol', { melee: true, noLoot: true, dmg: [75, 75], range: [2.6, 2.6], reach: 2.6, interval: 0.75, magSize: 1, reload: 0, infinite: true, auto: false, move: 1.12, adsTime: 0.1, adsFov: 74, adsMove: 1, spreadHip: 0, spreadAds: 0, recoilV: 0, recoilH: 0, len: 0.34, sightDrop: 0, maxRange: 3, tracerRange: 1, desc: 'Melee sidearm. Hold the left mouse button to slash: 75 damage to the enemy in front of you, one swing every 0.75 s. No ammo. You run faster with it.' }),
);

// Skill weapon: the Annihilator (not selectable, never in crates)
add(W('annihilator', 'Annihilator', 'Pistol', { skillWeapon: true, dmg: [150, 150], range: [60, 80], interval: 0.4, magSize: 1, reload: 0, auto: false, move: 0.85, adsTime: 0.14, adsMove: 0.85, spreadHip: 1.2, spreadAds: 0.05, recoilV: 3.5, recoilH: 0.5, len: 0.28, headMul: 1, sightDrop: 0.008, maxRange: 120, tracerRange: 120, color: 0xff3030, desc: 'One round. 150 damage.' }));

// Pseudo weapon used when a Battle Royale / Zombies player carries nothing.
// Attack Chopper minigun (Scorestreak): replaces your gun while you pilot the chopper; not in loadouts or crates.
add(W('m134', 'M134 Minigun', 'Special', { skillWeapon: true, noLoot: true, dmg: [20, 20], range: [100, 220], interval: 0.04, magSize: 1500, reload: 0, infinite: true, auto: true, move: 1, adsTime: 0.1, adsFov: 70, adsMove: 1, spreadHip: 1.2, spreadAds: 1.2, recoilV: 0.12, recoilH: 0.1, len: 0.95, sightDrop: 0, maxRange: 240, tracerRange: 240, desc: 'Attack Chopper gun: 1500 rounds, 1500 RPM, 20 damage per hit.' }));
add(W('fists', 'Unarmed', 'Special', { unarmed: true, dmg: [0, 0], range: [1, 2], interval: 0.5, magSize: 0, reload: 0, infinite: true, auto: false, move: 1.05, adsMove: 1, spreadHip: 0, spreadAds: 0, recoilV: 0, recoilH: 0, len: 0.3, maxRange: 2, tracerRange: 1, desc: 'Nothing in your hands. Find a weapon crate.' }));

const CAT_ORDER = ['Assault Rifle', 'SMG', 'Marksman', 'Sniper', 'LMG', 'Shotgun', 'Special', 'Pistol'];
export const WEAPON_ORDER = CAT_ORDER.map(c => [c, Object.values(WEAPONS).filter(w => w.cat === c && !w.unarmed && !w.skillWeapon).map(w => w.id)]).filter(x => x[1].length);

export const DEFAULT_PRIMARY = 'm4a1';
export const DEFAULT_SECONDARY = 'makarov';
export const isPistol = (id) => !!WEAPONS[id] && WEAPONS[id].cat === 'Pistol' && !WEAPONS[id].skillWeapon;
// the sidearm every mode starts with (Makarov unless the player picked another pistol in the loadout)
export const secondaryFor = (primary, secondary) => (isPistol(secondary) ? secondary : DEFAULT_SECONDARY);

export function damageAt(w, dist) {
  const [d0, d1] = w.dmg, [r0, r1] = w.range;
  if (dist <= r0) return d0;
  if (dist >= r1) return d1;
  return d0 + (d1 - d0) * (dist - r0) / (r1 - r0);
}
export function moveMul(wid, aim, plating) {
  const w = WEAPONS[wid] || WEAPONS.m4a1;
  return w.move * (aim ? w.adsMove : 1) * (plating ? PLAYER.plateMove : 1);
}
export function spreadFor(w, aim, onGround) {
  return (aim ? w.spreadAds : w.spreadHip) * (onGround ? 1 : 1.6);
}

// Loot table for crates: [weapon id, weight]. Each category has a share, split between its weapons (so adding weapons never skews the loot).
const SHARE = { 'Assault Rifle': 28, SMG: 22, Marksman: 12, Shotgun: 12, LMG: 8, Sniper: 10, Special: 3, Pistol: 5 };
const countBy = {}; for (const w of Object.values(WEAPONS)) if (!w.unarmed && !w.skillWeapon && !w.noLoot) countBy[w.cat] = (countBy[w.cat] || 0) + 1;
export const LOOT_WEAPONS = Object.values(WEAPONS).filter(x => !x.unarmed && !x.skillWeapon && !x.noLoot).map(x => [x.id, (SHARE[x.cat] || 1) / countBy[x.cat]]);
