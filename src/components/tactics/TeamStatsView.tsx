import { useState } from 'react';
import { useGame, useUserClub, PosTag } from '../ui';
import { avgRating, playerName } from '../../engine/ratings';

type Key = 'pos' | 'name' | 'ovr' | 'apps' | 'goals' | 'assists' | 'xg' | 'xa' | 'shots' | 'rating';
const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

/** Season averages for the club and a sortable table of the squad's season numbers. */
export default function TeamStatsView({ onPick }: { onPick: (id: string) => void }) {
  const g = useGame();
  const club = useUserClub();
  const [sort, setSort] = useState<Key>('apps');
  const ts = g.teamStats && g.teamStats.year === g.season.year && g.teamStats.clubId === club.id ? g.teamStats : null;
  const n = ts?.g ?? 0;
  const per = (v: number | undefined, d = 2) => (n > 0 && v !== undefined ? (v / n).toFixed(d) : '–');
  const cards: [string, string][] = [
    ['Avg possession', n ? `${per(ts?.poss, 1)}%` : '–'], ['Goals / game', per(ts?.gf)], ['Conceded / game', per(ts?.ga)],
    ['Shots / game', per(ts?.shots, 1)], ['On target / game', per(ts?.sot, 1)], ['xG / game', per(ts?.xg)], ['xGC / game', per(ts?.xgc)],
    ['Clean sheets', n ? String(ts?.cs) : '–'], ['W-D-L', n ? `${ts?.w}-${ts?.d}-${ts?.l}` : '–'],
  ];
  const rows = club.playerIds.map((id) => g.players[id]).filter(Boolean).map((p) => ({ p, r: avgRating(p) }));
  const val: Record<Key, (x: typeof rows[0]) => number | string> = {
    pos: (x) => POS_ORDER.indexOf(x.p.position), name: (x) => x.p.lastName, ovr: (x) => x.p.ca, apps: (x) => x.p.season.apps,
    goals: (x) => x.p.season.goals, assists: (x) => x.p.season.assists, xg: (x) => x.p.season.xg, xa: (x) => x.p.season.xa,
    shots: (x) => x.p.season.shots, rating: (x) => x.r,
  };
  rows.sort((a, b) => {
    const va = val[sort](a), vb = val[sort](b);
    if (typeof va === 'string') return va.localeCompare(vb as string);
    return sort === 'pos' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
  const H = ({ k, children }: { k: Key; children: string }) => (
    <button className={`text-right first:text-left ${sort === k ? 'underline font-bold' : ''}`} onClick={() => setSort(k)}>{children}</button>
  );
  const cols = 'grid grid-cols-[38px_1fr_38px_38px_38px_38px_44px_44px_44px_52px] gap-x-1';
  return (
    <div className="mt-2">
      <div className="bg-[#0b1230] text-[#e8cf8f] font-mono p-3 rounded border border-amber-crt/40">
        <div className="text-sm tracking-widest mb-2">TEAM SEASON AVERAGES · {n} GAME{n === 1 ? '' : 'S'}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {cards.map(([l, v]) => (
            <div key={l} className="border border-amber-crt/30 px-2 py-1">
              <div className="text-[11px] opacity-70 uppercase">{l}</div>
              <div className="text-xl text-green-300">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[620px]">
          <div className={`${cols} text-xs uppercase opacity-70 px-1`}>
            <H k="pos">Pos</H><H k="name">Name</H><H k="ovr">Ovr</H><H k="apps">Apps</H><H k="goals">Gls</H><H k="assists">Ast</H><H k="xg">xG</H><H k="xa">xA</H><H k="shots">Shots</H><H k="rating">Rating</H>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {rows.map(({ p, r }) => (
              <button key={p.id} onClick={() => onPick(p.id)} className={`${cols} w-full items-center px-1 py-[2px] border-b border-black/10 text-sm text-right hover:bg-yellow-100/60`}>
                <span className="text-left"><PosTag pos={p.position} /></span>
                <span className="text-left truncate">{playerName(p)}</span>
                <b>{p.ca}</b><span>{p.season.apps}</span><span>{p.season.goals}</span><span>{p.season.assists}</span>
                <span>{p.season.xg.toFixed(1)}</span><span>{p.season.xa.toFixed(1)}</span><span>{p.season.shots}</span>
                <span className={r >= 7.2 ? 'text-green-800 font-bold' : r > 0 && r < 6.2 ? 'text-red-700' : ''}>{p.season.apps ? r.toFixed(2) : '–'}</span>
              </button>
            ))}
          </div>
          <div className="text-xs mt-1 opacity-70">Click a column to sort. Averages cover every competition this season.</div>
        </div>
      </div>
    </div>
  );
}
