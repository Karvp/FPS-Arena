import {WEAPONS} from '../game-shared/weapons.js';
export const ammoClassOf=(id)=>['Sniper','Marksman','LMG','Assault Rifle'].includes(WEAPONS[id]?.cat)?'heavy':'light';
export const rarityOf=(id)=>id==='l115a3'?4:1;
