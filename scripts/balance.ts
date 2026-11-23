import { generateWorld } from '../src/engine/worldGenerator';
import { advanceMatchweek, acceptJob, leaguePosition } from '../src/engine/seasonLoop';
const res: Record<string, { sacked: number; pos: number[] }> = {};
for (let seed = 1; seed <= 8; seed++) {
  const base = generateWorld('T', 'ENG', seed * 977);
  const arch = Object.values(base.clubs).filter((c) => c.archetype);
  for (const c of arch) {
    const g = structuredClone(base);
    const offer = { id: 'x', clubId: c.id, reason: '', expiresWeek: 99, isLifeline: false };
    g.jobOffers.push(offer);
    acceptJob(g, 'x');
    let sacked = false;
    for (let w = 0; w < 30; w++) { advanceMatchweek(g); if (g.status === 'SACKED') { sacked = true; break; } }
    const r = (res[c.archetype!] ??= { sacked: 0, pos: [] });
    if (sacked) r.sacked++;
    else r.pos.push(leaguePosition(g, c.id));
    if (!sacked && g.status === 'SACKED') r.sacked++;
  }
}
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(15), 'sacked', v.sacked, '/8  positions', v.pos.join(','));
