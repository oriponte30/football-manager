import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useGame } from '../ui';
import CRTMonitor from '../layout/CRTMonitor';
import type { MatchResult } from '../../types/match';
import { playerName } from '../../engine/ratings';

/** Diagnostic xG, xA, xGC, % possession, player ratings. */
export default function PostMatchStats({ results }: { results: MatchResult[] }) {
  const g = useGame();
  const openDossier = useGameStore((s) => s.openDossier);
  const [idx, setIdx] = useState(results.length - 1);
  const r = results[Math.min(idx, results.length - 1)];
  const me = g.manager.clubId;
  const H = g.clubs[r.homeId];
  const A = g.clubs[r.awayId];
  const rows: [string, string | number, string | number, number, number][] = [
    ['POSSESSION %', r.home.possessionPct, r.away.possessionPct, r.home.possessionPct, r.away.possessionPct],
    ['SHOTS', r.home.shots, r.away.shots, r.home.shots, r.away.shots],
    ['ON TARGET', r.home.shotsOnTarget, r.away.shotsOnTarget, r.home.shotsOnTarget, r.away.shotsOnTarget],
    ['xG', r.home.xg.toFixed(2), r.away.xg.toFixed(2), r.home.xg, r.away.xg],
    ['xGC', r.home.xgc.toFixed(2), r.away.xgc.toFixed(2), r.home.xgc, r.away.xgc],
    ['xA', r.home.xa.toFixed(2), r.away.xa.toFixed(2), r.home.xa, r.away.xa],
    ['BIG CHANCES', r.home.bigChances, r.away.bigChances, r.home.bigChances, r.away.bigChances],
  ];
  const myId = me === r.awayId ? r.awayId : r.homeId;
  const players = Object.values(r.players).filter((p) => p.clubId === myId).sort((a, b) => Number(b.started) - Number(a.started) || b.rating - a.rating);
  const motm = Object.values(r.players).sort((a, b) => b.rating - a.rating)[0];
  const verdict = diagnose(r, myId);
  return (
    <CRTMonitor title="POST-MATCH ANALYSIS" page="303" right={results.length > 1 ? (
      <span className="flex gap-2">{results.map((x, i) => <button key={x.id} className={i === idx ? 'underline' : ''} onClick={() => setIdx(i)}>{x.competition}</button>)}</span>
    ) : undefined}>
      <div className="text-center text-2xl t-white">
        {H.name} <span className={H.id === me ? 't-green' : 't-red'}>{r.homeGoals}</span>-<span className={A.id === me ? 't-green' : 't-red'}>{r.awayGoals}</span> {A.name}
        {r.penalties && <span className="t-cyan text-lg"> (pens {r.penalties.home}-{r.penalties.away})</span>}
      </div>
      <div className="mt-2 space-y-[2px]">
        {rows.map(([label, h, a, hv, av]) => {
          const tot = hv + av || 1;
          return (
            <div key={label} className="grid grid-cols-[60px_1fr_120px_1fr_60px] items-center gap-2">
              <span className="text-right t-white">{h}</span>
              <div className="h-2 bg-white/10 flex justify-end"><div className="h-full bg-amber-crt" style={{ width: `${(hv / tot) * 100}%` }} /></div>
              <span className="text-center t-dim">{label}</span>
              <div className="h-2 bg-white/10"><div className="h-full t-cyan bg-[#5ee7ff]" style={{ width: `${(av / tot) * 100}%` }} /></div>
              <span className="t-white">{a}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 t-cyan">ANALYST: {verdict}</div>
      {motm && <div className="t-dim">MAN OF THE MATCH: <span className="t-white">{g.players[motm.playerId] ? playerName(g.players[motm.playerId]) : '?'}</span> ({motm.rating.toFixed(1)})</div>}
      <div className="mt-3 grid grid-cols-[1fr_40px_30px_30px_44px_44px_36px_44px] t-dim text-base">
        <span>PLAYER</span><span>MIN</span><span>G</span><span>A</span><span>xG</span><span>xA</span><span>SH</span><span>RTG</span>
      </div>
      {players.map((ps) => {
        const p = g.players[ps.playerId];
        return (
          <div key={ps.playerId} className="crt-row grid grid-cols-[1fr_40px_30px_30px_44px_44px_36px_44px]">
            <button className="text-left truncate t-white hover:underline" onClick={() => p && openDossier(p.id)}>
              {p ? playerName(p) : 'Departed'}{ps.subbedOn ? ' ↑' : ''}{ps.injured ? ' ✚' : ''}
            </button>
            <span>{ps.minutes}</span><span className={ps.goals ? 't-green' : ''}>{ps.goals}</span><span>{ps.assists}</span>
            <span>{ps.xg.toFixed(2)}</span><span>{ps.xa.toFixed(2)}</span><span>{ps.shots}</span>
            <span className={ps.rating >= 7.5 ? 't-green' : ps.rating < 6 ? 't-red' : 't-white'}>{ps.rating.toFixed(1)}</span>
          </div>
        );
      })}
    </CRTMonitor>
  );
}

function diagnose(r: MatchResult, myId: string): string {
  const mine = r.homeId === myId ? r.home : r.away;
  const opp = r.homeId === myId ? r.away : r.home;
  const gf = mine.goals, ga = opp.goals;
  if (gf >= ga && mine.xg < opp.xg - 1.2) return gf > ga ? 'Daylight robbery. They battered us on xG and we stole it.' : 'Lucky to escape with a point. They created far more.';
  if (gf <= ga && mine.xg > opp.xg + 1.2) return gf < ga ? 'Robbed! We created the better chances. Finishing let us down.' : 'Two points dropped. We dominated the chances.';
  if (gf > ga && mine.xg < opp.xg - 0.5) return 'Smash and grab. We were second best on xG — enjoy it, but it won\'t last.';
  if (gf < ga && mine.xg > opp.xg + 0.5) return 'Robbed! We created the better chances. Finishing let us down.';
  if (mine.possessionPct >= 60 && mine.xg < 1) return 'Sterile possession. Lots of the ball, few clear chances. Try a more direct style?';
  if (opp.bigChances >= 3) return 'We kept giving away big chances. Tighten up — a lower block or a Ball-Winner may help.';
  if (mine.xg >= 2.2) return 'Excellent attacking display. The chance creation was relentless.';
  if (mine.possessionPct <= 40) return 'Overrun in midfield. Their midfield won the battle; consider extra bodies there.';
  return 'An even contest. Fine margins decided it.';
}
