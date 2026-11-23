import { generateWorld } from '../src/engine/worldGenerator';
import { advanceMatchweek, acceptJob, startNextSeason, leaguePosition } from '../src/engine/seasonLoop';
import { sortedTable } from '../src/engine/shadowLeagueEngine';
import { assignScout } from '../src/engine/scoutingEngine';
import { submitBid, completeBid, marketList, signFreeAgent, demandedWage } from '../src/engine/transferEngine';
import { signYouth } from '../src/engine/academyEngine';
import { squadStrength } from '../src/engine/lineup';

const country = (process.argv[2] ?? 'ENG') as 'ENG';
const t0 = Date.now();
const g = generateWorld('Test', country, Number(process.argv[3] ?? 42));
console.log('world gen ms', Date.now() - t0, 'players', Object.keys(g.players).length, 'json KB', Math.round(JSON.stringify(g).length / 1024));
console.log('offers', g.jobOffers.map((o) => g.clubs[o.clubId].name + ' ' + g.clubs[o.clubId].archetype));
acceptJob(g, g.jobOffers[0].id);
const me = g.manager.clubId!;
console.log('managing', g.clubs[me].name, 'strength', squadStrength(g, g.clubs[me]).toFixed(1), 'bank', g.clubs[me].finances.bank);
for (let season = 0; season < 3; season++) {
  let maxMs = 0;
  // scout & bid for a target
  const market = marketList(g, me, 'TRANSFER', '', 'ST', 30).filter((m) => m.value < 300000);
  if (market[0]) {
    console.log(assignScout(g, me, market[0].player.id).message);
    console.log(submitBid(g, me, { playerId: market[0].player.id, fee: Math.round(market[0].value * 1.3), wage: demandedWage(market[0].player, g.clubs[me]) * 1.4, years: 3, includePlayerId: null, type: 'TRANSFER', loanWageShare: 1 }).message);
  }
  const fa = marketList(g, me, 'FREE', '', 'ALL', 40)[0];
  if (fa) console.log('FA', signFreeAgent(g, me, fa.player.id, Math.round(demandedWage(fa.player, g.clubs[me]) * 1.3), 2).message);
  for (let w = 0; w < 30 && g.status === 'PLAYING'; w++) {
    advanceMatchweek(g);
    maxMs = Math.max(maxMs, g.lastSimMs);
    for (const f of g.faxes.filter((f) => !f.resolved && f.bidId && f.kind === 'BID_RESPONSE')) {
      const r = completeBid(g, f.bidId!, true);
      console.log('  wk', g.season.matchweek - 1, 'complete bid:', r.message);
    }
    for (const id of [...g.pendingYouth]) if (g.players[id].truePA > 60) signYouth(g, me, id);
  }
  const userClub = g.clubs[me];
  console.log(`Season ${g.season.year} status=${g.status} maxSimMs=${maxMs} lastSim=${g.lastSimMs}`);
  if (g.manager.clubId) console.log('  pos', leaguePosition(g, me), 'board', Math.round(userClub.board.value), 'bank', userClub.finances.bank, 'fan', Math.round(userClub.fanInterest));
  console.log('  ', g.seasonSummary?.lines.slice(0, 12).join('\n   '));
  for (const lg of Object.values(g.leagues).filter((l) => !l.isShadow)) {
    const t = sortedTable(lg.table);
    const strs = t.map((r) => squadStrength(g, g.clubs[r.clubId]).toFixed(0));
    console.log('  ', lg.name, 'by finish strengths:', strs.join(' '), 'pts', t[0].pts, t[15].pts);
  }
  const gs = Object.values(g.leagues).filter((l) => !l.isShadow).flatMap((l) => l.fixtures);
  console.log('  avg goals', (gs.reduce((a, f) => a + f.homeGoals + f.awayGoals, 0) / gs.length).toFixed(2), 'faxes', g.faxes.length, 'youth', g.pendingYouth.length);
  if (g.status === 'SACKED') {
    console.log('  SACKED. offers', g.jobOffers.length);
    if (g.jobOffers[0]) acceptJob(g, g.jobOffers[0].id); else break;
  }
  if (g.status === 'SEASON_END') { startNextSeason(g); }
  console.log('  rollover ok. status', g.status, 'players', Object.keys(g.players).length, 'json KB', Math.round(JSON.stringify(g).length / 1024), 'mw', g.season.matchweek);
}
