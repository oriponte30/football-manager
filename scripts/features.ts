/** Sanity stats for nationalities, injuries, unique worlds and news. */
import { generateWorld } from '../src/engine/worldGenerator';
import { advanceMatchweek, acceptJob, startNextSeason } from '../src/engine/seasonLoop';
import { squadStrength } from '../src/engine/lineup';

const g = generateWorld('T', 'ENG', 4242);
const g2 = generateWorld('T', 'ENG', 999);
const names = (x: typeof g) => Object.values(x.players).slice(0, 5).map((p) => `${p.firstName} ${p.lastName} (${p.nationality}, ${p.playstyle})`);
console.log('world A', names(g));
console.log('world B', names(g2));
const active = Object.values(g.clubs).filter((c) => !c.isShadow);
let dom = 0, tot = 0; const nat: Record<string, number> = {};
for (const c of active) for (const id of c.playerIds) { const p = g.players[id]; tot++; if (p.nationality === c.country) dom++; nat[p.nationality] = (nat[p.nationality] ?? 0) + 1; }
console.log('domestic share', (dom / tot).toFixed(2), 'nations used', Object.keys(nat).length);
console.log(Object.entries(nat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
const ids: Record<string, number> = {};
for (const c of Object.values(g.clubs)) ids[c.identity] = (ids[c.identity] ?? 0) + 1;
console.log('identities', ids);
const t1 = g.leagues['ENG-1'].clubIds.map((id) => squadStrength(g, g.clubs[id]).toFixed(1));
console.log('ENG-1 strengths', t1.join(' '));

acceptJob(g, g.jobOffers[0].id);
const sev: Record<string, number> = {}; const src: Record<string, number> = {};
const seen = new Set<string>();
const times: number[] = [];
for (let season = 0; season < 2; season++) {
  for (let w = 0; w < 30; w++) {
    advanceMatchweek(g);
    times.push(g.lastSimMs);
    for (const p of Object.values(g.players)) {
      if (p.injury && !seen.has(p.id + p.injury.year + p.injury.matchweek)) {
        seen.add(p.id + p.injury.year + p.injury.matchweek);
        sev[p.injury.severity] = (sev[p.injury.severity] ?? 0) + 1;
        src[p.injury.source] = (src[p.injury.source] ?? 0) + 1;
      }
    }
    if (g.status === 'SACKED') break;
  }
  if (g.status === 'SEASON_END') startNextSeason(g);
  else break;
}
console.log('injuries', sev, src, 'per club-season', (seen.size / (active.length * 2)).toFixed(1));
const cats: Record<string, number> = {};
for (const n of g.news) cats[n.category] = (cats[n.category] ?? 0) + 1;
console.log('news', g.news.length, cats);
console.log(g.news.slice(0, 12).map((n) => `${n.year} MW${n.matchweek} ${n.myClub ? '[MINE] ' : ''}${n.headline}`).join('\n'));
times.sort((a, b) => a - b);
console.log('sim ms median', times[Math.floor(times.length / 2)], 'max', times[times.length - 1]);
