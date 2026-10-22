from pathlib import Path
p=Path('/mnt/data/fps-c6-work')
f=p/'tactical-director.mjs'; s=f.read_text()
needle='export function tacticalDirectorDecision(game,target,baseline,now,memory={},policy={}){'
insert='''/** One randomized unit is a whole server episode, not a selected waypoint or
 * safety-qualified offer. Never advance the game RNG for the assignment.
 * Only the authoritative headless runner may use this research assignment.
 */
export function tacticalEpisodeExplorationAssignment(seed,probability=.5){
 if(!Number.isSafeInteger(seed)||!tdFinite(probability)||probability<0||probability>1)
   throw Error('Invalid tactical episode assignment');
 let h=(seed>>>0)^0x6d2b79f5;
 h=Math.imul(h^(h>>>16),0x7feb352d);
 h=Math.imul(h^(h>>>15),0x846ca68b);
 const draw=((h^(h>>>16))>>>0)/4294967296;
 return {unit:'episode',assignmentId:`episode-${seed}`,seed,draw,
   actuate:draw<probability,actionProbability:probability,
   controlProbability:1-probability,algorithm:'episode-hash-bernoulli-v1'};
}
'''
assert needle in s;s=s.replace(needle,insert+needle,1);f.write_text(s)
f=p/'lab/arena/train.mjs';s=f.read_text();
needle="import {DirectorOutcomeRecorder} from './director-outcome-recorder.mjs';"
assert needle in s;s=s.replace(needle,needle+"\nimport {tacticalEpisodeExplorationAssignment} from '../../tactical-director.mjs';",1)
needle="'director-engagement-exploration-all-lab'].includes(profile)"
assert needle in s;s=s.replace(needle,"'director-engagement-exploration-all-lab','director-engagement-episode-lab','director-engagement-episode-control-lab','director-engagement-episode-active-lab'].includes(profile)",1)
needle=" 'director-engagement-exploration-all-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorExplorationLab:true}};"
assert needle in s
s=s.replace(needle,""" 'director-engagement-exploration-all-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorExplorationLab:true},
 'director-engagement-episode-lab':{},
 'director-engagement-episode-control-lab':{},
 'director-engagement-episode-active-lab':{}};""",1)
needle="const config={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,...profiles[profile]};"
assert needle in s;s=s.replace(needle,"""const config={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,...profiles[profile]};
const episodeLab=profile.startsWith('director-engagement-episode-');
const episodeActiveConfig={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,
 ...profiles['director-engagement-exploration-all-lab']};
const episodeControlConfig={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,
 ...profiles.release};""",1)
needle=" const rseed=seed0+idx*101+['tdm','snd','hp','br','zm'].indexOf(mode)*10007;"
assert needle in s;s=s.replace(needle,""" const rseed=seed0+idx*101+['tdm','snd','hp','br','zm'].indexOf(mode)*10007;
 const episodeAssignment=episodeLab?tacticalEpisodeExplorationAssignment(rseed,
   profile==='director-engagement-episode-control-lab'?0:
   profile==='director-engagement-episode-active-lab'?1:.5):null;
 if(episodeAssignment){
   episodeAssignment.arm=episodeAssignment.actuate?'treatment':'control';
   episodeAssignment.design=episodeAssignment.actionProbability===0||episodeAssignment.actionProbability===1
     ?'forced-arm-diagnostic':'randomized-episode';
   // Exactly one assignment before Game.step(); no per-offer randomization in C6.
   // Treatment retains the original safe offer gate with probability 1.
   bus.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify(
     episodeAssignment.actuate?episodeActiveConfig:episodeControlConfig)}));
 }""",1)
needle=' const metrics={mode,seed:rseed,profile,opponentPolicy,seconds,primaryLoadout:traineePrimary,'
assert needle in s;s=s.replace(needle,' const metrics={mode,seed:rseed,profile,directorEpisodeAssignment:episodeAssignment,opponentPolicy,seconds,primaryLoadout:traineePrimary,',1)
needle=' metrics.directorDiagnosticCounts={...directorEventCounts};'
assert needle in s;s=s.replace(needle,' metrics.directorExplorationOffers=directorExplorationAssignmentTotal;\n'+needle,1)
f.write_text(s)
