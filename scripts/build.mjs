import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(path.join(dir, 'aim-core.mjs'), 'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .* from '\.\/(?:aim-core|combat-core|loot-core|weapon-tactics|zombie-weapon-choice)\.mjs';?\n/gm,'');
const duel = readFileSync(path.join(dir,'weapon-duel.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ');
const adsPolicy = readFileSync(path.join(dir, 'ads-tactics.mjs'), 'utf8').replace(/\bexport (const|function) /g, '$1 ');
const tactics = readFileSync(path.join(dir, 'combat-core.mjs'), 'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .*\n/gm,'');
const weaponTactics = readFileSync(path.join(dir, 'weapon-tactics.mjs'), 'utf8').replace(/\bexport (const|function) /g, '$1 ');
const loot = readFileSync(path.join(dir, 'loot-core.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ').replace(/^import .*\n/gm,'');
const multilayer = readFileSync(path.join(dir, 'multi-level-nav.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ');
const navigation = readFileSync(path.join(dir, 'navigation-core.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .*\n/gm,'');
const zombieNav = readFileSync(path.join(dir, 'zombie-nav.mjs'), 'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .* from '\.\/(?:combat-core|loot-core)\.mjs';?\n/gm,'');
const intel = readFileSync(path.join(dir,'threat-intel.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ').replace(/^import .* from '\.\/(?:aim-core|combat-core)\.mjs';?\n/gm,'');
const cameraTactics = readFileSync(path.join(dir,'camera-tactics.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ').replace(/^import .*\n/gm,'');
const tacticalNav = readFileSync(path.join(dir,'tactical-nav.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ').replace(/^import .* from '\.\/camera-tactics\.mjs';?\n/gm,'');
const evaluation = readFileSync(path.join(dir,'weapon-evaluation.mjs'),'utf8')
  .replace(/\bexport (const|function) /g,'$1 ')
  .replace(/\b(clamp|finite|round|damageAt)\b/g,n=>'eval'+n[0].toUpperCase()+n.slice(1));
const zchoice = readFileSync(path.join(dir,'zombie-weapon-choice.mjs'),'utf8')
  .replace(/\bexport (const|function) /g,'$1 ').replace(/^import .*\n/gm,'');
const policy = readFileSync(path.join(dir,'weapon-policy.mjs'),'utf8')
  .replace(/\bexport (const|function) /g,'$1 ')
  .replace(/^import .*\n/gm,'')
  .replace(/\bcap\b/g,'policyCap');
const objectives = readFileSync(path.join(dir,'objective-tactics.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const squad = readFileSync(path.join(dir,'squad-tactics.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const squadLegacy = readFileSync(path.join(dir,'squad-legacy.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const macro = readFileSync(path.join(dir,'macro-goal-controller.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const macroCombat = readFileSync(path.join(dir,'macro-combat-v2.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const macroVantage = readFileSync(path.join(dir,'macro-vantage.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const engagementBallistics = readFileSync(path.join(dir,'engagement-ballistics.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ');
const engagementMotion = readFileSync(path.join(dir,'engagement-motion.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .* from '\.\/(?:engagement-ballistics|engagement-motion)\.mjs';?\n/gm,'');
const tacticalDirector = readFileSync(path.join(dir,'tactical-director.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .* from '\.\/(?:engagement-ballistics|engagement-motion)\.mjs';?\n/gm,'');
const goalAware = readFileSync(path.join(dir,'goal-aware-arbiter.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ');
const macroOptions = readFileSync(path.join(dir,'macro-options-v3.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const macroOwnership = readFileSync(path.join(dir,'macro-action-ownership.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const macroCover = readFileSync(path.join(dir,'macro-cover-approach.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const motion = readFileSync(path.join(dir,'motion-stabilizer.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const recorder = readFileSync(path.join(dir,'match-recorder.mjs'),'utf8')
  .replace(/\bexport (const|function) /g,'$1 ');
const skillsPolicy = readFileSync(path.join(dir,'skill-tactics.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const evasion=readFileSync(path.join(dir,'evasion-core.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ').replace(/^import .* from '\.\/(?:tactical-nav|camera-tactics)\.mjs';?\n/gm,'');
const defense = readFileSync(path.join(dir,'defensive-core.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ').replace(/^import .*\n/gm,'');
const throwables = readFileSync(path.join(dir,'throwable-core.mjs'),'utf8').replace(/\bexport (const|function) /g,'$1 ');
const weaponInput = readFileSync(path.join(dir, 'weapon-input.mjs'),'utf8').replace(/\bexport (const|function) /g, '$1 ').replace(/^import .*\n/gm,'');
const agent = readFileSync(path.join(dir, 'agent-entry.js'), 'utf8');
writeFileSync(path.join(dir, 'page-agent.js'), `// Generated by node scripts/build.mjs. Do not edit manually.\n${core}\n${weaponTactics}\n${duel}\n${adsPolicy}\n${tactics}\n${multilayer}\n${navigation}\n${loot}\n${zombieNav}\n${intel}\n${cameraTactics}\n${tacticalNav}\n${evaluation}\n${zchoice}\n${policy}\n${objectives}\n${squad}\n${squadLegacy}\n${motion}\n${macro}\n${macroCombat}\n${macroVantage}\n${macroOptions}\n${engagementBallistics}
${engagementMotion}
${tacticalDirector}\n${goalAware}\n${macroOwnership}\n${macroCover}\n${recorder}\n${skillsPolicy}\n${evasion}\n${defense}\n${throwables}\n${weaponInput}\n${agent}`);
console.log('Built page-agent.js');
