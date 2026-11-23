import { useState } from 'react';
import { useGame } from '../ui';
import { useGameStore } from '../../store/useGameStore';
import { withLiveTables, hasPendingMatches } from '../../engine/liveTable';
import CRTMonitor from '../layout/CRTMonitor';
import { sortedTable } from '../../engine/shadowLeagueEngine';
import type { Fixture, GameState, TableRow } from '../../types/world';
import { COUNTRY_CODES } from '../../types/world';

type Tab = 'T1' | 'T2' | 'T3' | 'CUP' | 'EURO' | 'RESULTS' | 'ABROAD';

/** 3-tier tables, Domestic Cup, 16-team European Cup bracket, results. */
export default function LeagueTableCRT() {
  const real = useGame();
  const live = useGameStore((s) => s.liveScore);
  // while your match is on, the table shows only what you have seen
  const g = withLiveTables(real, live);
  const hidden = hasPendingMatches(real);
  const me = g.manager.clubId as string;
  const myTier = g.clubs[me].tier;
  const [tab, setTab] = useState<Tab>(`T${myTier}` as Tab);
  const a = g.activeCountry;
  const tabs: [Tab, string][] = [['T1', 'TIER 1'], ['T2', 'TIER 2'], ['T3', 'TIER 3'], ['CUP', 'CUP'], ['EURO', 'EUROPE'], ['RESULTS', 'RESULTS'], ['ABROAD', 'ABROAD']];
  return (
    <CRTMonitor title="TELETEXT SPORT" page="302" bodyClassName="pt-1">
      <div className="flex flex-wrap gap-x-3 mb-2 text-lg">
        {tabs.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'bg-amber-crt text-navy-900 px-1' : 'hover:text-white'}>{l}</button>
        ))}
      </div>
      <div className="max-h-[560px] overflow-y-auto crt-scroll">
        {(tab === 'T1' || tab === 'T2' || tab === 'T3') && <LeagueTable g={g} leagueId={`${a}-${tab[1]}`} me={me} zones />}
        {hidden && (tab === 'CUP' || tab === 'EURO' || tab === 'RESULTS') && <div className="t-dim">This week's results come in after the final whistle.</div>}
        {!hidden && tab === 'CUP' && <CupView g={g} me={me} />}
        {!hidden && tab === 'EURO' && <EuroView g={g} me={me} />}
        {!hidden && tab === 'RESULTS' && <Results g={g} me={me} />}
        {tab === 'ABROAD' && (
          <div className="space-y-4">
            <div className="t-dim">Shadow leagues resolve in a single pass at season end. Last completed tables:</div>
            {COUNTRY_CODES.filter((c) => c !== a).map((c) => <LeagueTable key={c} g={g} leagueId={`${c}-1`} me={me} compact />)}
          </div>
        )}
      </div>
    </CRTMonitor>
  );
}

function LeagueTable({ g, leagueId, me, zones, compact }: { g: GameState; leagueId: string; me: string; zones?: boolean; compact?: boolean }) {
  const lg = g.leagues[leagueId];
  const rows: TableRow[] = sortedTable(lg.table);
  const n = rows.length;
  return (
    <div>
      <div className="t-white">{lg.name.toUpperCase()}</div>
      <div className="grid grid-cols-[28px_1fr_30px_30px_30px_30px_44px_36px] t-dim text-base">
        <span>#</span><span>CLUB</span><span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>PTS</span>
      </div>
      {(compact ? rows.slice(0, 5) : rows).map((r, i) => {
        const c = g.clubs[r.clubId];
        const promo = zones && lg.tier > 1 && i < 2;
        const playoff = zones && lg.tier > 1 && (i === 2 || i === 3);
        const releg = zones && lg.tier < 3 && i >= n - 3;
        const euro = zones && lg.tier === 1 && i < 3;
        return (
          <div key={r.clubId} className={`crt-row grid grid-cols-[28px_1fr_30px_30px_30px_30px_44px_36px] ${r.clubId === me ? 'crt-row-me' : ''}`}>
            <span className={promo || euro ? 't-green' : playoff ? 't-cyan' : releg ? 't-red' : ''}>{i + 1}</span>
            <span className={`truncate ${r.clubId === me ? 't-green' : 't-white'}`}>{c.name}</span>
            <span>{r.p}</span><span>{r.w}</span><span>{r.d}</span><span>{r.l}</span>
            <span>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</span><span className="t-white">{r.pts}</span>
          </div>
        );
      })}
      {zones && <div className="t-dim text-base mt-1">{lg.tier === 1 ? 'GREEN = European Cup · RED = relegation' : lg.tier === 2 ? 'GREEN = promoted · CYAN = play-off · RED = relegated' : 'GREEN = promoted · CYAN = play-off'}</div>}
    </div>
  );
}

function FixtureLine({ g, f, me }: { g: GameState; f: Fixture; me: string }) {
  const mine = f.homeId === me || f.awayId === me;
  const h = g.clubs[f.homeId];
  const a = g.clubs[f.awayId];
  const hw = f.winnerId === f.homeId;
  const aw = f.winnerId === f.awayId;
  return (
    <div className={`crt-row grid grid-cols-[1fr_70px_1fr] ${mine ? 'crt-row-me' : ''}`}>
      <span className={`truncate text-right ${hw ? 't-white' : ''}`}>{h.name}{h.tier !== a.tier && !h.isShadow ? ` (${h.tier})` : ''}</span>
      <span className="text-center t-green">{f.played ? `${f.homeGoals}-${f.awayGoals}${f.penalties ? 'p' : ''}` : 'v'}</span>
      <span className={`truncate ${aw ? 't-white' : ''}`}>{a.name}{h.tier !== a.tier && !a.isShadow ? ` (${a.tier})` : ''}</span>
    </div>
  );
}

function CupView({ g, me }: { g: GameState; me: string }) {
  return (
    <div className="space-y-3">
      <div className="t-white">{g.cup.name.toUpperCase()} {g.cup.championId && <span className="t-green">— WINNERS: {g.clubs[g.cup.championId].name}</span>}</div>
      {[...g.cup.rounds].reverse().map((r) => (
        <div key={r.name}>
          <div className="t-cyan">{r.name.toUpperCase()} (MW {r.matchweek})</div>
          {r.ties.length === 0 ? <div className="t-dim">Draw pending.</div> : r.ties.map((t) => <FixtureLine key={t.id} g={g} f={t} me={me} />)}
        </div>
      ))}
    </div>
  );
}

function EuroView({ g, me }: { g: GameState; me: string }) {
  const e = g.euro;
  const flag = (id: string) => g.clubs[id].country;
  return (
    <div className="space-y-3">
      <div className="t-white">EUROPEAN CUP {e.championId && <span className="t-green">— CHAMPIONS: {g.clubs[e.championId].name}</span>}</div>
      {e.final && <div><div className="t-cyan">FINAL</div><FixtureLine g={g} f={e.final} me={me} /></div>}
      {e.semiFinals.length > 0 && <div><div className="t-cyan">SEMI-FINALS</div>{e.semiFinals.map((f) => <FixtureLine key={f.id} g={g} f={f} me={me} />)}</div>}
      {e.quarterFinals.length > 0 && <div><div className="t-cyan">QUARTER-FINALS</div>{e.quarterFinals.map((f) => <FixtureLine key={f.id} g={g} f={f} me={me} />)}</div>}
      <div className="grid md:grid-cols-2 gap-3">
        {e.groups.map((grp) => (
          <div key={grp.name}>
            <div className="t-cyan">GROUP {grp.name}</div>
            {sortedTable(grp.table).map((r, i) => (
              <div key={r.clubId} className={`crt-row grid grid-cols-[18px_1fr_40px_30px] ${r.clubId === me ? 'crt-row-me' : ''}`}>
                <span className={i < 2 ? 't-green' : ''}>{i + 1}</span>
                <span className="truncate t-white">{g.clubs[r.clubId].name} <span className="t-dim">{flag(r.clubId)}</span></span>
                <span>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</span>
                <span>{r.pts}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="t-dim text-base">Groups: MW 4–14 · QF MW 18 · SF MW 23 · Final MW 28 (neutral)</div>
    </div>
  );
}

function Results({ g, me }: { g: GameState; me: string }) {
  const lines = g.lastWeekResults;
  if (lines.length === 0) return <div className="t-dim">No results yet this season.</div>;
  const order = ['EURO', 'CUP', 'LEAGUE', 'PLAYOFF'];
  return (
    <div>
      <div className="t-white">MATCHWEEK {g.season.matchweek - 1} RESULTS</div>
      {order.map((comp) => {
        const ls = lines.filter((l) => l.competition === comp);
        if (!ls.length) return null;
        return (
          <div key={comp} className="mt-2">
            <div className="t-cyan">{comp === 'EURO' ? 'EUROPEAN CUP' : comp === 'CUP' ? g.cup.name.toUpperCase() : comp === 'LEAGUE' ? 'LEAGUE' : 'PLAY-OFFS'}</div>
            {ls.map((l) => <FixtureLine key={l.fixtureId} g={g} me={me} f={{ id: l.fixtureId, competition: l.competition, matchweek: 0, homeId: l.homeId, awayId: l.awayId, played: true, homeGoals: l.homeGoals, awayGoals: l.awayGoals, penalties: l.penalties, winnerId: l.homeGoals > l.awayGoals ? l.homeId : l.homeGoals < l.awayGoals ? l.awayId : l.penalties ? (l.penalties.home > l.penalties.away ? l.homeId : l.awayId) : null }} />)}
          </div>
        );
      })}
    </div>
  );
}
