// Usage: node tools/check-game-compat.mjs /path/to/fps-arena-main
// Structural compatibility check against a locally extracted FPS Arena web build.
// This does not claim multiplayer/runtime verification; it fails for incompatible API changes.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
const gameRoot = resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.error('Usage: node tools/check-game-compat.mjs /path/to/fps-arena-main');
  process.exit(2);
}
const checks = [
  ['client/index.html', /id=["']gl["']/],
  ['client/index.html', /id=["']hud["']/],
  ['client/index.html', /src=["']\/client\/main\.js["']/],
  ['client/game.js', /export class Game\s*\{/],
  ['client/game.js', /\bonSnap\(s\)\s*\{/],
  ['client/game.js', /\bonShot\(d\)\s*\{/],
  ['client/game.js', /\bsimTick\(\)\s*\{/],
  ['client/game.js', /\bframe\(dt,\s*active,\s*paused\)\s*\{/],
  ['client/game.js', /this\.input\.sample\(\)/],
  ['client/game.js', /this\.rig\.look\(dx,\s*dy,/],
  ['client/game.js', /this\.you\s*=\s*s\.you/],
  ['client/game.js', /s\.you\.ss.*view/],
  ['client/game.js', /this\.remotes\.addSnap\(s\)/],
  ['client/game.js', /this\.zremotes\.addSnap\(s,\s*'zm'\)/],
  ['client/game.js', /onEnts\(d\)/],
  ['client/loot.js', /class LootView/],
  ['shared/loot.js', /export function findUseTarget/],
  ['shared/rarity.js', /export const ammoClassOf/],
  ['shared/rarity.js', /export const rarityOf/],
  ['server/game.js', /const ab = this\.abil, useEdge/],
  ['shared/weaponstate.js', /fireEdge && g\.mag <= 0/],
  ['client/camera.js', /export class CameraRig/],
  ['client/camera.js', /\blook\(dx,\s*dy,\s*sens\)\s*\{/],
  ['client/input.js', /\bsample\(\)\s*\{/],
  ['client/input.js', /streak:\s*live/],
  ['client/remote.js', /export class Remotes/],
  ['client/remote.js', /r\.data\s*=\s*p/],
  ['client/remote.js', /r\.team\s*=\s*p\.tm/],
  ['client/player.js', /this\.inView/],
  ['server/combat.js', /const sx = Math\.cos\(yaw\) \* l \* LEAN\.offset/],
  ['server/combat.js', /rayAABB\(eye, dir, x \+ sx \* 0\.5/],
  ['server/combat.js', /raySphere\(eye, dir, x \+ sx/],
  ['shared/constants.js', /\bLEAN = \{ offset: 0\.35, deg: 18, rate: 7 \}/],
  ['shared/constants.js', /\bheadYs:\s*\[/],
  ['shared/constants.js', /\bPITCH_MAX\s*=/],
  ['shared/geometry.js', /export function rayWorld/],
  ['shared/movement.js', /export (?:const|function) eyeHeightOf/],
  ['shared/skills.js', /export const THROW_LIST/],
  ['shared/skills.js', /export const THROWABLES/],
  ['shared/skills.js', /export const THROW_SPEED/],
  ['shared/weapons.js', /export const WEAPONS/],
  ['shared/weapons.js', /shellReload:/],
  ['shared/weaponstate.js', /export function stepWeapons/],
  ['shared/weaponstate.js', /fireEdge.*prevFire/],
  ['shared/weaponstate.js', /inp\.reload/],
];
let pass=0;
let missing=[];
for (const [relative,pattern] of checks) {
  const path=join(gameRoot,relative);
  const found=existsSync(path)&&pattern.test(readFileSync(path,'utf8'));
  if (found) pass++;
  else missing.push(`${relative}: ${pattern}`);
}
for (const item of missing) console.error(`MISMATCH ${item}`);
console.log(`FPS Arena web API structural checks: ${pass}/${checks.length} passed`);
process.exit(missing.length ? 1 : 0);
