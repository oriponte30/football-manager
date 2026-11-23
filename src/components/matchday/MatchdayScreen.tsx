import { useEffect, useMemo, useState } from 'react';
import { Play, FastForward, Newspaper } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, ordinal, PosTag } from '../ui';
import CRTMonitor from '../layout/CRTMonitor';
import LeagueTableCRT from './LeagueTableCRT';
import PostMatchStats from './PostMatchStats';
import { userFixturesThisWeek, leaguePosition, userInCup } from '../../engine/seasonLoop';
import { squadStrength } from '../../engine/lineup';
import { sortedTable } from '../../engine/shadowLeagueEngine';
import { unscoutedOvrRange } from '../../engine/scoutingEngine';
import { hash01 } from '../../engine/rng';
import type { MatchEvent, MatchResult } from '../../types/match';
import type { GameState, Fixture } from '../../types/world';

export default function MatchdayScreen() {
  const g = useGame();
  const club = useUserClub();
  const { playMatchweek, tickerKey, setFaxOpen } = useGameStore();
  const fixtures = userFixturesThisWeek(g);
  const canPlay = g.status === 'PLAYING' && g.season.matchweek <= 30;
  const [busy, setBusy] = useState(false);

  const simMany = (n: number) => {
    setBusy(true);
    let i = 0;
    const step = () => {
      const s = useGameStore.getState();
      if (i >= n || !s.game || s.game.status !== 'PLAYING') { setBusy(false); return; }
      s.playMatchweek();
      i++;
      setTimeout(step, 30);
    };
    step();
  };

  return (
    <div className="grid xl:grid-cols-[1.05fr_1fr] gap-5">
      <div className="space-y-5">
        <CRTMonitor title={`MATCHWEEK ${Math.min(30, g.season.matchweek)} — THIS WEEK`} page="301" right={<span>{g.season.year}</span>}>
          {fixtures.length === 0 && <div className="t-dim">No fixtures. {g.season.matchweek > 30 ? 'The season is complete.' : ''}</div>}
          <div className="space-y-3">
            {fixtures.map((f) => <OpponentPreview key={f.id} g={g} f={f} />)}
          </div>
          {g.dilemma && (
            <button className="mt-3 t-red blink-none underline" onClick={() => setFaxOpen(true)}>! DRESSING ROOM DILEMMA ON YOUR FAX — 1 CLICK TO RESOLVE</button>
          )}
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <button disabled={!canPlay || busy} className="btn btn-green text-3xl px-6 py-1 flex items-center gap-2" onClick={playMatchweek}>
              <Play size={24} fill="currentColor" /> PLAY MATCHWEEK
            </button>
            <button disabled={!canPlay || busy} className="btn btn-sm flex items-center gap-1" onClick={() => simMany(5)} title="Play the next 5 matchweeks">
              <FastForward size={16} /> SIM ×5
            </button>
            <span className="t-dim text-base">last sim: {g.lastSimMs}ms</span>
          </div>
          <div className="mt-2 t-dim text-base">
            {club.name}: {ordinal(leaguePosition(g, club.id))} in {g.leagues[club.leagueId].name} · Board goal: {club.board.goal.label} · {userInCup(g) ? `Still in the ${g.cup.name}` : `Out of the ${g.cup.name}`}
          </div>
        </CRTMonitor>
        <Ticker key={tickerKey} results={g.lastUserResults} />
        {g.lastUserResults.length > 0 && <PostMatchStats results={g.lastUserResults} />}
      </div>
      <div className="space-y-5">
        <LeagueTableCRT />
        <NewsPaper />
      </div>
    </div>
  );
}

function OpponentPreview({ g, f }: { g: GameState; f: Fixture }) {
  const me = g.manager.clubId as string;
  const home = f.homeId === me;
  const opp = g.clubs[home ? f.awayId : f.homeId];
  const mine = g.clubs[me];
  const s1 = useMemo(() => squadStrength(g, mine), [g, mine]);
  const s2 = useMemo(() => squadStrength(g, opp), [g, opp]);
  // the scouting preview is a fuzzy read, not the truth
  const fuzz = (hash01(opp.id.length * 7919 + g.season.matchweek, opp.id) - 0.5) * 6;
  const diff = s2 + fuzz - s1;
  const verdict = diff > 6 ? 'MUCH STRONGER' : diff > 2 ? 'STRONGER' : diff < -6 ? 'MUCH WEAKER' : diff < -2 ? 'WEAKER' : 'EVENLY MATCHED';
  const lg = g.leagues[opp.leagueId];
  const pos = opp.isShadow || !lg.table[opp.id]?.p ? null : sortedTable(lg.table).findIndex((r) => r.clubId === opp.id) + 1;
  const form = lg.table[opp.id]?.form ?? [];
  const danger = opp.playerIds.map((id) => g.players[id]).filter((p) => p && p.injuryWeeks === 0).sort((a, b) => b.ca - a.ca)[0];
  const comp = f.competition === 'LEAGUE' ? 'LEAGUE' : f.competition === 'CUP' ? `${g.cup.name.toUpperCase()} · ${f.label ?? ''}` : `EUROPEAN CUP · ${f.label ?? ''}`;
  return (
    <div className="border border-amber-crt/40 p-2">
      <div className="t-cyan">{comp}</div>
      <div className="text-2xl t-white">{home ? 'HOME' : 'AWAY'} vs {opp.name.toUpperCase()}</div>
      <div className="flex flex-wrap gap-x-6">
        <span>{pos ? `${ordinal(pos)} in ${lg.name}` : `${lg.name} (${opp.country})`}</span>
        <span>FORM: {form.length ? form.map((r, i) => <span key={i} className={r === 'W' ? 't-green' : r === 'L' ? 't-red' : 't-white'}>{r}</span>) : '—'}</span>
        <span>SCOUT VERDICT: <span className={diff > 2 ? 't-red' : diff < -2 ? 't-green' : 't-white'}>{verdict}</span></span>
      </div>
      <div className="t-dim">STYLE: <span className="t-cyan">{opp.identity.toUpperCase()}</span> · {opp.tactics.formation} · {opp.playerIds.filter((id) => (g.players[id]?.injuryWeeks ?? 0) > 0).length} INJURED</div>
      {danger && (
        <div className="t-dim">DANGER MAN: <span className="t-white">{danger.firstName} {danger.lastName}</span> <PosTag pos={danger.position} /> OVR ~{unscoutedOvrRange(danger).join('–')}</div>
      )}
      {opp.rivalId === me && <div className="t-red">!! DERBY DAY !!</div>}
    </div>
  );
}

const SHOW: MatchEvent['type'][] = ['KICK_OFF', 'GOAL', 'SHOT_SAVED', 'SHOT_OFF_TARGET', 'SHOT_CLEARED', 'INJURY', 'SUBSTITUTION', 'HALF_TIME', 'FULL_TIME', 'PENALTY_SHOOTOUT'];

function Ticker({ results }: { results: MatchResult[] }) {
  const g = useGame();
  const lines = useMemo(() => {
    const out: { text: string; cls: string; key: string }[] = [];
    results.forEach((r, ri) => {
      out.push({ key: `h${ri}`, cls: 't-cyan', text: `=== ${g.clubs[r.homeId].name.toUpperCase()} v ${g.clubs[r.awayId].name.toUpperCase()} (${r.competition}) ===` });
      r.events.forEach((e, ei) => {
        if (!SHOW.includes(e.type)) return;
        const isShot = e.type === 'SHOT_SAVED' || e.type === 'SHOT_OFF_TARGET' || e.type === 'SHOT_CLEARED';
        if (isShot && !e.keyMoment && (e.xg ?? 0) < 0.15) return;
        const star = e.keyMoment ? '★ ' : '';
        const cls = e.type === 'GOAL' ? 't-green' : e.type === 'INJURY' ? 't-red' : e.type === 'FULL_TIME' || e.type === 'HALF_TIME' ? 't-white' : '';
        const xg = e.xg !== undefined ? ` [xG ${e.xg.toFixed(2)}]` : '';
        out.push({ key: `${ri}-${ei}`, cls, text: `${String(e.minute).padStart(3, ' ')}' ${star}${e.text}${xg}` });
      });
    });
    return out;
  }, [results, g]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (lines.length === 0) return;
    setShown(1);
    const t = setInterval(() => setShown((s) => (s >= lines.length ? s : s + 1)), 110);
    return () => clearInterval(t);
  }, [lines]);
  if (results.length === 0) {
    return (
      <CRTMonitor title="LIVE TICKER" page="302">
        <div className="t-dim">Awaiting kick-off. Press PLAY MATCHWEEK.<span className="blink">▮</span></div>
      </CRTMonitor>
    );
  }
  const done = shown >= lines.length;
  return (
    <CRTMonitor title="LIVE TICKER" page="302" right={!done ? <button onClick={() => setShown(lines.length)}>[SKIP ▶▶]</button> : <span>FT</span>}>
      <div className="max-h-72 overflow-y-auto crt-scroll flex flex-col-reverse">
        <div>
          {lines.slice(0, shown).map((l) => <div key={l.key} className={`ticker-line ${l.cls}`}>{l.text}</div>)}
          {!done && <span className="blink">▮</span>}
        </div>
      </div>
    </CRTMonitor>
  );
}

function NewsPaper() {
  const g = useGame();
  const club = useUserClub();
  const fi = Math.round(club.fanInterest);
  const headline = fi >= 80 ? 'TOWN GRIPPED BY FOOTBALL FEVER' : fi >= 60 ? 'FANS DARE TO DREAM' : fi >= 40 ? 'SUPPORTERS WAIT AND SEE' : fi >= 20 ? 'EMPTY SEATS AND GRUMBLES' : 'FANS DESERT THE TERRACES';
  return (
    <div className="newspaper p-4 rotate-[-0.4deg]">
      <div className="flex justify-between items-baseline border-b-2 border-black pb-1">
        <h3 className="text-xl flex items-center gap-2"><Newspaper size={18} /> The Evening Pink</h3>
        <span className="text-xs">Matchweek {Math.min(30, g.season.matchweek)}</span>
      </div>
      <div className="mt-2 font-black text-2xl leading-6 uppercase">{headline}</div>
      <div className="flex items-center gap-2 mt-2 text-sm">
        <span>Buzz meter</span>
        <div className="flex-1 h-3 border border-black bg-white"><div className="h-full bg-black" style={{ width: `${fi}%` }} /></div>
        <b>{fi}%</b>
      </div>
      <ul className="mt-3 text-sm space-y-1 list-disc pl-5 max-h-48 overflow-y-auto">
        {g.news.slice(0, 8).map((n) => <li key={n.id}>{n.myClub && <b className="text-red-800">★ </b>}{n.headline}</li>)}
        {g.news.length === 0 && <li>Pre-season optimism abounds.</li>}
      </ul>
      <button className="text-sm underline mt-2" onClick={() => useGameStore.getState().setScreen('NEWS')}>Read the full paper →</button>
    </div>
  );
}
