// User settings persisted in localStorage.
import { cleanAtt } from '/shared/attachments.js';
const KEY = 'fpsarena.settings.v1';
export const settings = { sens: 1, fov: 75, volume: 0.6, shake: 0.6, reduced: false, name: '', primary: 'm4a1', secondary: 'makarov', skill: '', throwable: 'frag', streaks: ['uav', 'trophy', 'emp'], dev: false, att: {} };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
// weapon modification: settings.att[weaponId] = "optic|grip|laser|muzzle" (see shared/attachments.js); every weapon keeps its own set
if (!settings.att || typeof settings.att !== 'object') settings.att = {};
export const attOf = (weaponId) => cleanAtt(weaponId, settings.att[weaponId] || '');                 // canonical list string of that weapon's (max 2) attachments
export const attIds = (weaponId) => attOf(weaponId).split('|').filter(Boolean);
export function setAttIds(weaponId, ids) { settings.att[weaponId] = cleanAtt(weaponId, ids.join('|')); saveSettings(); }
