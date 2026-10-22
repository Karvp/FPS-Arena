// Weapon asset loading with explicit success/failure logging. A failed GLB never breaks the game: a procedural gun replaces it.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '/shared/weapons.js';
import { analyze, buildProcedural } from './weaponmodel.js';

const loader = new GLTFLoader();
export const prepared = new Map();      // id -> prepared model
export const loadStatus = new Map();    // id -> {ok, file, error}

async function loadOne(id) {
  const w = WEAPONS[id], url = '/' + w.file;
  if (id === 'laser_rifle' || w.skillWeapon) { prepared.set(id, buildProcedural(id)); loadStatus.set(id, { ok: true, file: 'procedural', error: null }); console.log(`[MODEL] LOADED: ${id} / procedural`); return; }       // laser rifle + skill weapons (Annihilator, EM2) are procedural by design
  try {
    const gltf = await loader.loadAsync(url);
    const prep = analyze(id, gltf.scene);
    prepared.set(id, prep); loadStatus.set(id, { ok: true, file: url, error: null });
    console.log(`[MODEL] LOADED: ${id} / ${url}`, prep.axes);
  } catch (e) {
    console.error(`[MODEL] FAILED: ${id} / ${url} / ${e && e.message ? e.message : e}`);
    prepared.set(id, buildProcedural(id)); loadStatus.set(id, { ok: false, file: url, error: String(e && e.message || e) });
  }
}
const listeners = new Set();
export function onLoaded(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const inflight = new Map();
export function loadWeapon(id) { if (!inflight.has(id)) inflight.set(id, loadOne(id).then(() => { listeners.forEach(f => f(id)); })); return inflight.get(id); }
// Loads `ids` (default: every weapon) with 4 parallel workers. The game only waits for the weapons it needs right away;
// the rest streams in the background and the viewmodel / loadout preview / loot swap the real model in as soon as it arrives.
export async function preloadAll(onProgress, ids = Object.keys(WEAPONS).filter(i => !WEAPONS[i].unarmed)) {
  let done = 0; const queue = [...new Set(ids)];
  const worker = async () => { while (queue.length) { const id = queue.shift(); await loadWeapon(id); onProgress && onProgress(++done, ids.length, id); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}
