import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, FastForward, SkipForward, Coffee, Mic, Dumbbell, ChevronRight, Waves, Flame, Scale } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, ordinal, PosTag, Stars, staffStars } from '../ui';
import CRTMonitor from '../layout/CRTMonitor';
import LeagueTableCRT from './LeagueTableCRT';
import PostMatchStats from './PostMatchStats';
import { userFixturesThisWeek, leaguePosition, userInCup } from '../../engine/seasonLoop';
import { squadStrength } from '../../engine/lineup';
import { sortedTable } from '../../engine/shadowLeagueEngine';
import { unscoutedOvrRange } from '../../engine/scoutingEngine';
import { RECOVERY_INFO, drillAvailable, weekSessions, drillProgressOf, drillRate, DRILLS_PER_WEEK } from '../../engine/weekEngine';
import { DRILLS, type DrillKind } from '../../data/drills';
import { hash01 } from '../../engine/rng';
import { playerName } from '../../engine/ratings';
import type { MatchEvent, MatchResult } from '../../types/match';
import type { GameState, Fixture, RecoveryChoice } from '../../types/world';
import { matchDate } from '../news/NewsTab';

export default function MatchdayScreen() {
  const g = useGame();
  return (
    <div className="grid xl:grid-cols-[1.1fr_1fr] gap-5">
      <div className="space-y-5 page-in" key={g.phase}>
        {g.phase === 'MATCHDAY' ? <LiveMatchday /> : g.phase === 'DAY_AFTER' ? <DayAfter /> : <Prep />}
      </div>
      <div className="space-y-5">
        <LeagueTableCRT />
      </div>
    </div>
  );
}

/* ================================================================== */
/* PREP: the week before the game                                      */
/* ================================================================== */

function Prep() {
  const g = useGame();
  const club = useUserClub();
  const { playMatchweek, quickSim, simming } = useGameStore();
  const fixtures = userFixturesThisWeek(g);
  const canPlay = g.status === 'PLAYING' && g.season.matchweek <= 30;
  return (
    <>
      <CRTMonitor title={`MATCHWEEK ${Math.min(30, g.season.matchweek)} — THE WEEK AHEAD`} page="301" right={<span>{fmtDay(g, g.season.matchweek)}</span>}>
        {fixtures.length === 0 && <div className="t-dim">No fixtures. {g.season.matchweek > 30 ? 'The season is complete.' : ''}</div>}
        <div className="space-y-3">
          {fixtures.map((f) => <OpponentPreview key={f.id} g={g} f={f} />)}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <button disabled={!canPlay || simming} className="btn btn-green text-3xl px-6 py-1 flex items-center gap-2" onClick={playMatchweek}>
            <Play size={24} fill="currentColor" /> KICK OFF
          </button>
          <button disabled={!canPlay || simming} className="btn btn-sm flex items-center gap-1" onClick={() => quickSim(5)} title="Simulate the next 5 matchweeks without watching. Stops if something urgent lands on the fax.">
            <FastForward size={16} /> {simming ? 'SIMULATING…' : 'QUICK SIM ×5'}
          </button>
        </div>
        <div className="mt-2 t-dim text-base">
          {club.name}: {ordinal(leaguePosition(g, club.id))} in {g.leagues[club.leagueId].name} · Board goal: {club.board.goal.label} · {userInCup(g) ? `Still in the ${g.cup.name}` : `Out of the ${g.cup.name}`}
        </div>
      </CRTMonitor>
      {drillAvailable(g) && g.status === 'PLAYING' && <DrillPanel compact />}
    </>
  );
}

function fmtDay(g: GameState, mw: number, plusDays = 0): string {
  const d = matchDate(g.season.year, mw);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function OpponentPreview({ g, f }: { g: GameState; f: Fixture }) {
  const me = g.manager.clubId as string;
  const home = f.homeId === me;
  const opp = g.clubs[home ? f.awayId : f.homeId];
  const mine = g.clubs[me];
  const s1 = useMemo(() => squadStrength(g, mine), [g, mine]);
  const s2 = useMemo(() => squadStrength(g, opp), [g, opp]);
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

/* ================================================================== */
/* MATCHDAY: watch each of this week's games live, one at a time       */
/* ================================================================== */

const SHOW: MatchEvent['type'][] = ['KICK_OFF', 'GOAL', 'SHOT_SAVED', 'SHOT_OFF_TARGET', 'SHOT_CLEARED', 'INJURY', 'SUBSTITUTION', 'TACTICAL', 'HALF_TIME', 'FULL_TIME', 'PENALTY_SHOOTOUT'];
const SPEEDS = [{ label: '1×', ms: 520 }, { label: '2×', ms: 260 }, { label: '4×', ms: 110 }];
/** survives leaving and re-entering the page: where each live match had got to */
const progress = new Map<string, number>();
let speedPref = 0;

function LiveMatchday() {
  const g = useGame();
  const { markWatched, finishMatchday } = useGameStore();
  const pending = g.lastUserResults.filter((r) => !g.watchedResults.includes(r.id));
  const [reviewId, setReviewId] = useState<string | null>(null);
  const current = pending[0];
  // the match you just finished stays on screen (with its stats) until you continue
  const review = reviewId ? g.lastUserResults.find((r) => r.id === reviewId) : null;
  const shown = review ?? current;
  if (!shown) {
    return (
      <CRTMonitor title="FULL TIME" page="302">
        <div className="t-dim">All of this week's matches are in.</div>
        <button className="btn btn-green mt-3" onClick={finishMatchday}>CONTINUE ▶</button>
      </CRTMonitor>
    );
  }
  const idx = g.lastUserResults.findIndex((r) => r.id === shown.id);
  const more = g.lastUserResults.length - idx - 1;
  return (
    <LiveMatch
      key={shown.id}
      r={shown}
      label={g.lastUserResults.length > 1 ? `MATCH ${idx + 1} OF ${g.lastUserResults.length}` : undefined}
      finished={!!review}
      onFullTime={() => { setReviewId(shown.id); markWatched(shown.id); }}
      onContinue={() => {
        setReviewId(null);
        if (more <= 0) finishMatchday();
      }}
      continueLabel={more > 0 ? 'NEXT MATCH ▶' : 'ON TO THE MORNING AFTER ▶'}
    />
  );
}

function LiveMatch({ r, label, finished, onFullTime, onContinue, continueLabel }: {
  r: MatchResult; label?: string; finished: boolean; onFullTime: () => void; onContinue: () => void; continueLabel: string;
}) {
  const g = useGame();
  const me = g.manager.clubId as string;
  const H = g.clubs[r.homeId];
  const A = g.clubs[r.awayId];
  const events = useMemo(() => r.events.filter((e) => {
    if (!SHOW.includes(e.type)) return false;
    const shot = e.type === 'SHOT_SAVED' || e.type === 'SHOT_OFF_TARGET' || e.type === 'SHOT_CLEARED';
    return !shot || !!e.keyMoment || (e.xg ?? 0) >= 0.12;
  }), [r]);
  const endMinute = useMemo(() => Math.max(90, ...r.events.map((e) => e.minute)), [r]);
  const [minute, setMinute] = useState(() => (finished ? endMinute + 1 : progress.get(r.id) ?? 0));
  const [speed, setSpeed] = useState(speedPref);
  const [flash, setFlash] = useState<string | null>(null);
  const done = minute > endMinute;
  const fired = useRef(false);

  useEffect(() => {
    if (done) {
      progress.delete(r.id);
      if (!fired.current && !finished) { fired.current = true; onFullTime(); }
      return;
    }
    const isHT = events.some((e) => e.type === 'HALF_TIME' && e.minute === minute);
    const t = setTimeout(() => {
      setMinute((m) => { const n = m + 1; progress.set(r.id, n); return n; });
    }, isHT ? SPEEDS[speed].ms * 4 + 600 : SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [minute, speed, done, events, r.id, finished, onFullTime]);

  const visible = events.filter((e) => e.minute <= minute);
  const goals = visible.filter((e) => e.type === 'GOAL');
  const hg = done ? r.homeGoals : goals.filter((e) => e.clubId === r.homeId).length;
  const ag = done ? r.awayGoals : goals.filter((e) => e.clubId === r.awayId).length;
  const lastGoal = goals[goals.length - 1];
  useEffect(() => {
    if (!lastGoal || done) return;
    setFlash(lastGoal.clubId === me ? 'mine' : 'theirs');
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [lastGoal?.minute, lastGoal?.clubId, me, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const clock = done ? 'FT' : minute === 0 ? 'KO' : `${Math.min(minute, 90)}'${minute > 90 ? `+${minute - 90}` : ''}`;
  const comp = r.competition === 'LEAGUE' ? g.leagues[g.clubs[me].leagueId].name : r.competition === 'CUP' ? g.cup.name : r.competition === 'EURO' ? 'European Cup' : 'Play-off';
  return (
    <>
      <div className={`scoreboard ${flash ? `flash-${flash}` : ''}`}>
        <div className="sb-top"><span>{label ?? comp.toUpperCase()}</span><span>{label ? comp.toUpperCase() : ''}</span></div>
        <div className="sb-main">
          <TeamPlate name={H.name} c={H.colors} mine={H.id === me} />
          <div className="sb-score">
            <span className={H.id === me ? 'mine' : 'theirs'}>{hg}</span>
            <span className="opacity-50">–</span>
            <span className={A.id === me ? 'mine' : 'theirs'}>{ag}</span>
          </div>
          <TeamPlate name={A.name} c={A.colors} mine={A.id === me} right />
        </div>
        <div className="sb-clock">
          <span className={`${done ? '' : 'live-dot'}`}>{clock}</span>
          {r.penalties && done && <span className="ml-3 text-base">pens {r.penalties.home}–{r.penalties.away}</span>}
        </div>
        <div className="sb-progress"><div style={{ width: `${Math.min(100, (Math.min(minute, endMinute) / endMinute) * 100)}%` }} /></div>
      </div>

      <CRTMonitor title="LIVE COMMENTARY" page="302" right={!done ? (
        <span className="flex items-center gap-1">
          {SPEEDS.map((s, i) => <button key={s.label} className={`px-1 ${speed === i ? 'bg-amber-crt text-navy-900' : ''}`} onClick={() => { speedPref = i; setSpeed(i); }}>{s.label}</button>)}
          <button className="px-1 flex items-center" onClick={() => setMinute(endMinute + 1)} title="Skip to full time"><SkipForward size={16} /></button>
        </span>
      ) : <span>FULL TIME</span>}>
        <div className="h-64 overflow-y-auto crt-scroll">
          {[...visible].reverse().map((e, i) => <CommentaryLine key={`${e.minute}-${e.type}-${i}-${visible.length}`} e={e} me={me} fresh={i === 0 && !done} />)}
          {visible.length === 0 && <div className="t-dim">The teams are out. The referee checks his watch…<span className="blink">▮</span></div>}
        </div>
      </CRTMonitor>

      {done && (
        <div className="page-in space-y-4">
          <PostMatchStats results={[r]} />
          <button className="btn btn-green text-2xl px-5" onClick={onContinue}>{continueLabel}</button>
        </div>
      )}
    </>
  );
}

function TeamPlate({ name, c, mine, right }: { name: string; c: [string, string]; mine: boolean; right?: boolean }) {
  return (
    <div className={`sb-team ${right ? 'right' : ''}`}>
      <span className="sb-crest" style={{ background: c[0], borderColor: c[1] }} />
      <span className={`truncate ${mine ? 'text-white' : 'text-[#d8d2c0]'}`}>{name}</span>
    </div>
  );
}

function CommentaryLine({ e, me, fresh }: { e: MatchEvent; me: string; fresh: boolean }) {
  const mine = e.clubId === me;
  let cls = '';
  let icon = '';
  if (e.type === 'GOAL') { cls = mine ? 'goal-mine' : 'goal-theirs'; icon = '⚽ '; }
  else if (e.type === 'INJURY') { cls = 't-red'; icon = '✚ '; }
  else if (e.type === 'SUBSTITUTION') { cls = mine ? 't-cyan' : 't-dim'; icon = '⇄ '; }
  else if (e.type === 'TACTICAL') { cls = 't-dim'; icon = '✎ '; }
  else if (e.type === 'HALF_TIME' || e.type === 'FULL_TIME' || e.type === 'KICK_OFF') cls = 't-white';
  else cls = mine ? '' : 't-dim';
  return (
    <div className={`ticker-line ${cls} ${fresh ? 'line-in' : ''}`}>
      <span className="inline-block w-10 text-right mr-2 opacity-80">{e.minute}'</span>{icon}{e.text}
    </div>
  );
}

/* ================================================================== */
/* DAY AFTER: recovery, press, one-on-one drill                        */
/* ================================================================== */

function DayAfter() {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const [open, setOpen] = useState<string | null>(null);
  const results = g.lastUserResults;
  const openR = open ? results.find((r) => r.id === open) : null;
  const physio = staffStars(g, club, 'PHYSIO');
  const icons: Record<RecoveryChoice, typeof Waves> = { REST: Waves, BALANCED: Scale, INTENSE: Flame };
  const tired = club.playerIds.map((id) => g.players[id]).filter((p) => p && p.injuryWeeks === 0 && p.fitness < 75).length;
  return (
    <>
      <div className="paper p-4 desk-note">
        <div className="flex justify-between items-baseline">
          <div className="font-type text-2xl flex items-center gap-2"><Coffee size={20} /> The morning after</div>
          <div className="text-sm opacity-70">Sunday · {fmtDay(g, Math.max(1, g.season.matchweek - 1), 1)}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {results.map((r) => <ResultCard key={r.id} r={r} on={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} />)}
          {results.length === 0 && <div className="text-sm opacity-70">No match for you this week.</div>}
        </div>
      </div>
      {openR && <div className="page-in"><PostMatchStats results={[openR]} /></div>}

      <div className="paper p-4">
        <div className="font-bold flex items-center gap-2"><Waves size={16} /> RECOVERY SESSION <span className="text-sm font-normal opacity-70">· {tired} player{tired === 1 ? '' : 's'} below 75% · physio <Stars value={physio} size={11} /></span></div>
        <div className="grid sm:grid-cols-3 gap-2 mt-2">
          {(Object.keys(RECOVERY_INFO) as RecoveryChoice[]).map((k) => {
            const Icon = icons[k];
            const chosen = g.dayAfter.recovery === k;
            return (
              <button key={k} disabled={!!g.dayAfter.recovery} onClick={() => s.recovery(k)}
                className={`choice-card ${chosen ? 'on' : ''} ${g.dayAfter.recovery && !chosen ? 'opacity-40' : ''}`}>
                <div className="font-bold flex items-center gap-1"><Icon size={15} /> {RECOVERY_INFO[k].label}</div>
                <div className="text-xs mt-1 text-left">{RECOVERY_INFO[k].blurb}</div>
              </button>
            );
          })}
        </div>
        {!g.dayAfter.recovery && <div className="text-xs opacity-70 mt-1">Skip it and the staff run a light session.</div>}
      </div>

      <PressRoom />
      <DrillPanel />

      <div className="flex justify-end">
        <button className="btn btn-green text-2xl px-5 flex items-center gap-1" onClick={s.beginPrep}>
          {g.status === 'PLAYING' && g.season.matchweek <= 30 ? 'PREPARE FOR THE NEXT MATCH' : 'BACK TO THE DESK'} <ChevronRight size={22} />
        </button>
      </div>
    </>
  );
}

function ResultCard({ r, on, onClick }: { r: MatchResult; on: boolean; onClick: () => void }) {
  const g = useGame();
  const me = g.manager.clubId as string;
  const home = r.homeId === me;
  const gf = home ? r.homeGoals : r.awayGoals;
  const ga = home ? r.awayGoals : r.homeGoals;
  const opp = g.clubs[home ? r.awayId : r.homeId];
  const res = gf > ga || (r.penalties && (home ? r.penalties.home > r.penalties.away : r.penalties.away > r.penalties.home)) ? 'W' : gf < ga || r.penalties ? 'L' : 'D';
  return (
    <button onClick={onClick} className={`result-card res-${res} ${on ? 'on' : ''}`}>
      <span className="text-xs uppercase opacity-70">{r.competition} · {home ? 'home' : 'away'}</span>
      <span className="font-type text-lg leading-5">{gf}–{ga} <span className="text-sm">vs {opp.name}</span></span>
      <span className="text-xs underline">{on ? 'hide stats' : 'match stats'}</span>
    </button>
  );
}

function PressRoom() {
  const g = useGame();
  const s = useGameStore();
  const pc = g.pressConference;
  return (
    <div className="paper p-4">
      <div className="font-bold flex items-center gap-2"><Mic size={16} /> PRESS CONFERENCE</div>
      {pc ? (
        <>
          <div className="font-type text-lg mt-2">{pc.text}</div>
          <div className="flex flex-col gap-2 mt-2">
            {pc.options.map((o, i) => (
              <button key={i} className="choice-card text-left" onClick={() => s.answerPress(i)}>
                <div className="font-bold">{o.label}</div>
                <div className="text-xs">{o.description}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm opacity-70 mt-1">{g.dayAfter.pressDone ? 'Done. The journalists have their quotes.' : 'The press room is quiet today.'}</div>
      )}
    </div>
  );
}

function DrillPanel({ compact }: { compact?: boolean }) {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const sessions = weekSessions(g);
  const done = new Set(sessions.map((x) => x.playerId));
  const squad = useMemo(() => club.playerIds.map((id) => g.players[id]).filter((p) => p && p.injuryWeeks === 0).sort((a, b) => a.age - b.age || b.ca - a.ca), [g, club]);
  const choices = squad.filter((p) => !done.has(p.id));
  const [pidRaw, setPid] = useState<string>(choices[0]?.id ?? '');
  const pid = choices.some((p) => p.id === pidRaw) ? pidRaw : choices[0]?.id ?? '';
  const p = g.players[pid];
  const opts = DRILLS.filter((d) => (p?.position === 'GK' ? !d.outfieldOnly : !d.gkOnly));
  const [drillRaw, setDrill] = useState<DrillKind>(opts[0]?.id ?? 'PASSING');
  const drill = opts.some((d) => d.id === drillRaw) ? drillRaw : opts[0]?.id ?? 'PASSING';
  const def = DRILLS.find((d) => d.id === drill);
  const avail = drillAvailable(g);
  const coach = staffStars(g, club, 'HEAD_COACH');
  const prog = p && def ? Math.max(...def.stats.map((k) => drillProgressOf(g, p.id, k))) : 0;
  const rate = p ? drillRate(p, coach) : 0;
  return (
    <div className="paper p-4">
      <div className="font-bold flex items-center gap-2 flex-wrap">
        <Dumbbell size={16} /> ONE-ON-ONE SESSIONS
        <span className="text-sm font-normal opacity-70">· {sessions.length}/{DRILLS_PER_WEEK} this week · head coach <Stars value={coach} size={11} /></span>
      </div>
      {sessions.length > 0 && (
        <div className="mt-1 text-sm space-y-[2px]">
          {sessions.map((x) => {
            const sp = g.players[x.playerId];
            const sd = DRILLS.find((d) => d.id === x.drill);
            const pr = sp && sd ? Math.max(...sd.stats.map((k) => drillProgressOf(g, sp.id, k))) : 0;
            return (
              <div key={x.playerId} className="flex items-center gap-2">
                <span className="w-40 truncate">✓ {sp ? playerName(sp) : '?'}</span>
                <span className="w-24 opacity-80">{sd?.label}</span>
                {x.gained ? <b className="text-green-800">{x.gained}</b> : <span className="flex items-center gap-1 opacity-80"><span className="inline-block w-20 h-2 bg-black/10 rounded-sm overflow-hidden"><span className="block h-full bg-[#7a6a45]" style={{ width: `${pr * 100}%` }} /></span>{Math.round(pr * 100)}%</span>}
              </div>
            );
          })}
        </div>
      )}
      {avail && choices.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 items-center text-sm">
          <select className="desk-input" value={pid} onChange={(e) => setPid(e.target.value)}>
            {choices.map((x) => <option key={x.id} value={x.id}>{x.lastName} · {x.position} · {x.age} · {x.ca} · fit {Math.round(x.fitness)}%</option>)}
          </select>
          <div className="seg">
            {opts.map((d) => <button key={d.id} className={drill === d.id ? 'on' : ''} onClick={() => setDrill(d.id)}>{d.label}</button>)}
          </div>
          <button className="btn btn-sm btn-amber" disabled={!p || !def} onClick={() => s.drill(pid, drill)}>RUN SESSION</button>
          {p && def && (
            <div className="w-full text-xs opacity-80">
              {!compact && <>{def.blurb} </>}Trains {def.stats.join(' and ')}, costs about {def.fitness}% fitness.
              {' '}{p.lastName}: {Math.round(prog * 100)}% towards the next point, roughly {rate >= 0.3 ? 'a point every two or three weeks' : rate >= 0.15 ? 'a point every month or so' : 'very slow progress at his age and level'}.
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm mt-1 opacity-70">That's this week's sessions done. Progress builds week by week; young players with room to grow move fastest.</div>
      )}
    </div>
  );
}
