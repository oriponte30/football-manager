/**
 * The manager's week between matchdays. Pure TS.
 *
 *   PREP ──kick off──▶ MATCHDAY (watch each game live) ──▶ DAY_AFTER ──▶ PREP
 *
 * DAY_AFTER holds the recovery session (rest / balanced / intense), the
 * press conference and — any time before the next kick-off — one
 * one-on-one drill with a single player.
 */
import type { GameState, RecoveryChoice } from '../types/world';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Dilemma } from '../types/transfers';
import { DRILLS, type DrillKind } from '../data/drills';
import { applyDilemmaEffects } from './moraleEngine';
import { staffStarsOf } from './staffGenerator';
import { applyInjury, rollInjury } from './injuryEngine';
import { ovrFor, fullName } from './ratings';
import { ageCurve } from './progressionEngine';
import { clamp, type Rng } from './rng';
import { nextId } from './ids';

const userClub = (g: GameState): Club | null => (g.manager.clubId ? g.clubs[g.manager.clubId] : null);

/** Called by advanceMatchweek once the week's games are simulated. */
export function afterMatchweek(g: GameState, rng: Rng): void {
  g.dayAfter = { recovery: null, pressDone: false };
  g.pressConference = null;
  const pending = g.lastUserResults.filter((r) => !g.watchedResults.includes(r.id));
  if (pending.length > 0) g.phase = 'MATCHDAY';
  else startDayAfter(g, rng);
}

export function markWatched(g: GameState, resultId: string): void {
  if (!g.watchedResults.includes(resultId)) g.watchedResults.push(resultId);
  if (g.watchedResults.length > 12) g.watchedResults = g.watchedResults.slice(-12);
}

export function allWatched(g: GameState): boolean {
  return g.lastUserResults.every((r) => g.watchedResults.includes(r.id));
}

export function startDayAfter(g: GameState, rng: Rng): void {
  for (const r of g.lastUserResults) markWatched(g, r.id);
  g.phase = 'DAY_AFTER';
  g.dayAfter = { recovery: null, pressDone: false };
  g.pressConference = g.status === 'PLAYING' ? makePressConference(g, rng) : null;
}

/** End the day after; a skipped recovery session defaults to a balanced one. */
export function beginPrep(g: GameState, rng: Rng): void {
  if (g.phase === 'DAY_AFTER' && !g.dayAfter.recovery) recoverySession(g, rng, 'BALANCED');
  g.pressConference = null;
  g.phase = 'PREP';
}

/* ------------------------------------------------------------------ */
/* Recovery session                                                    */
/* ------------------------------------------------------------------ */

export const RECOVERY_INFO: Record<RecoveryChoice, { label: string; blurb: string }> = {
  REST: { label: 'Rest & recovery', blurb: 'Ice baths, massage, a walk on the beach. Fresh legs, no development.' },
  BALANCED: { label: 'Light session', blurb: 'Stretch, rondos, set-piece walk-through. A bit of everything.' },
  INTENSE: { label: 'Double session', blurb: 'Hard running and tactical drills. Players improve, legs suffer, knocks happen.' },
};

export function recoverySession(g: GameState, rng: Rng, choice: RecoveryChoice): { ok: boolean; message: string } {
  const club = userClub(g);
  if (!club) return { ok: false, message: 'No club.' };
  if (g.dayAfter.recovery) return { ok: false, message: 'Today\'s session is already done.' };
  const coach = staffStarsOf(g, club.id, 'HEAD_COACH');
  const physio = staffStarsOf(g, club.id, 'PHYSIO');
  let hurt: Player | null = null;
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (!p || p.injuryWeeks > 0) continue;
    if (choice === 'REST') p.fitness = Math.min(100, p.fitness + 8 + physio);
    else if (choice === 'BALANCED') {
      p.fitness = Math.min(100, p.fitness + 3);
      p.xpBank += 0.05 * (0.6 + coach * 0.12);
    } else {
      p.fitness = clamp(p.fitness - 7, 35, 100);
      p.xpBank += 0.16 * (0.6 + coach * 0.12) * Math.min(1.4, ageCurve(p.age, p.careerCurve));
      if (!hurt && rng.chance(0.012 * (1 - (physio - 1) * 0.04))) hurt = p;
    }
  }
  if (choice === 'REST') club.teamAtmosphere = clamp(club.teamAtmosphere + 1, 0, 100);
  if (choice === 'INTENSE') club.teamAtmosphere = clamp(club.teamAtmosphere - 1, 0, 100);
  g.dayAfter.recovery = choice;
  if (hurt) {
    const inj = rollInjury(rng, physio, 'TRAINING', g.season.year, g.season.matchweek);
    applyInjury(g, hurt, inj);
    return { ok: false, message: `${RECOVERY_INFO[choice].label} done — but ${fullName(hurt)} pulled up: ${inj.name}, ${inj.weeksTotal} wk.` };
  }
  return { ok: true, message: `${RECOVERY_INFO[choice].label} done.` };
}

/* ------------------------------------------------------------------ */
/* One-on-one drills: up to three players a week                       */
/* ------------------------------------------------------------------ */

export const DRILLS_PER_WEEK = 3;

export function weekSessions(g: GameState): { playerId: string; drill: DrillKind; gained: string }[] {
  const d = g.weekDrills;
  return d && d.year === g.season.year && d.week === g.season.matchweek ? d.sessions : [];
}

export function drillAvailable(g: GameState): boolean {
  return weekSessions(g).length < DRILLS_PER_WEEK;
}

/** How far a player is towards his next +1 from drills, 0..1. */
export function drillProgressOf(g: GameState, playerId: string, stat: string): number {
  return g.drillProgress?.[`${playerId}:${stat}`] ?? 0;
}

/**
 * Per-session progress (fractions of a stat point). A 3★ coach with a young
 * player who has room to grow earns about a point every 4 sessions; a
 * veteran near his ceiling barely moves. Hidden PA always caps it.
 */
export function drillRate(p: Player, coachStars: number): number {
  const age = p.age <= 21 ? 1.2 : p.age <= 25 ? 1 : p.age <= 29 ? 0.6 : 0.3;
  const room = clamp((p.truePA - p.ca) / 8, 0.1, 1);
  return (0.13 + 0.07 * coachStars) * age * room;
}

/** The most recent completed program (last week's, or earlier if a week was skipped). */
export function lastDrillPlan(g: GameState): { playerId: string; drill: DrillKind }[] {
  const d = g.weekDrills;
  const current = d && d.year === g.season.year && d.week === g.season.matchweek;
  const plan = current ? g.lastDrillPlan ?? [] : d?.sessions.map(({ playerId, drill }) => ({ playerId, drill })) ?? g.lastDrillPlan ?? [];
  const club = userClub(g);
  return plan.filter((x) => club && g.players[x.playerId]?.clubId === club.id);
}

/** Run last week's program again: same players, same drills (skips anyone injured, tired or already done). */
export function repeatDrillPlan(g: GameState, rng: Rng): { ok: boolean; message: string } {
  const plan = lastDrillPlan(g);
  if (plan.length === 0) return { ok: false, message: 'No previous program to repeat.' };
  const out: string[] = [];
  let ran = 0;
  for (const x of plan) {
    if (!drillAvailable(g)) break;
    if (weekSessions(g).some((s) => s.playerId === x.playerId)) continue;
    const r = runDrill(g, rng, x.playerId, x.drill);
    if (r.ok) ran++;
    out.push(r.message);
  }
  return { ok: ran > 0, message: out.join(' ') || 'Nothing to repeat.' };
}

export function runDrill(g: GameState, rng: Rng, playerId: string, drill: DrillKind): { ok: boolean; message: string } {
  const club = userClub(g);
  const p = g.players[playerId];
  const def = DRILLS.find((d) => d.id === drill);
  if (!club || !p || p.clubId !== club.id || !def) return { ok: false, message: 'Not available.' };
  if (g.phase === 'MATCHDAY') return { ok: false, message: 'It\'s matchday. Drills wait until tomorrow.' };
  const sessions = weekSessions(g);
  if (sessions.length >= DRILLS_PER_WEEK) return { ok: false, message: `You've run all ${DRILLS_PER_WEEK} one-on-one sessions this week.` };
  if (sessions.some((x) => x.playerId === playerId)) return { ok: false, message: `${p.lastName} has already had his session this week.` };
  if (p.injuryWeeks > 0) return { ok: false, message: `${p.lastName} is injured.` };
  if (def.gkOnly && p.position !== 'GK') return { ok: false, message: 'That drill is for goalkeepers.' };
  if (def.outfieldOnly && p.position === 'GK') return { ok: false, message: 'Keepers have their own drills.' };
  if (p.fitness < 55) return { ok: false, message: `${p.lastName} is running on empty (${Math.round(p.fitness)}%). Rest him first.` };
  const coach = staffStarsOf(g, club.id, 'HEAD_COACH');
  const rate = drillRate(p, coach) * rng.range(0.8, 1.2);
  g.drillProgress ??= {};
  let gained = '';
  // the work is split across the drill's stats
  for (const k of def.stats) {
    const key = `${p.id}:${k}`;
    let prog = (g.drillProgress[key] ?? 0) + rate / def.stats.length;
    if (prog >= 1 && p.stats[k] < 99) {
      p.stats[k] += 1;
      const ca = ovrFor(p.stats, p.position);
      if (ca > p.truePA) { p.stats[k] -= 1; prog = 0.95; }
      else { p.ca = ca; prog -= 1; gained += `${gained ? ', ' : ''}+1 ${k}`; }
    }
    g.drillProgress[key] = Math.min(prog, 0.99);
  }
  p.fitness = clamp(p.fitness - def.fitness, 30, 100);
  p.moraleValue = clamp(p.moraleValue + 1, 0, 100);
  // first session of a new week: last week's program becomes the one we offer again
  if (sessions.length === 0 && g.weekDrills && g.weekDrills.sessions.length > 0) g.lastDrillPlan = g.weekDrills.sessions.map(({ playerId: pid, drill: d }) => ({ playerId: pid, drill: d }));
  g.weekDrills = { year: g.season.year, week: g.season.matchweek, sessions: [...sessions, { playerId, drill, gained }] };
  if (rng.chance(0.01 + (def.id === 'SPRINTS' ? 0.008 : 0))) {
    const inj = rollInjury(rng, staffStarsOf(g, club.id, 'PHYSIO'), 'TRAINING', g.season.year, g.season.matchweek);
    applyInjury(g, p, inj);
    return { ok: false, message: `${p.lastName} tweaked something in the ${def.label.toLowerCase()} session: ${inj.name} (${inj.weeksTotal} wk).` };
  }
  const pct = Math.round(Math.max(...def.stats.map((k) => drillProgressOf(g, p.id, k))) * 100);
  return gained
    ? { ok: true, message: `${def.label} with ${p.lastName}: ${gained}!` }
    : { ok: true, message: `${def.label} with ${p.lastName}: good work (${pct}% towards the next point)${p.ca >= p.truePA ? '. He may be near his ceiling.' : '.'}` };
}

/* ------------------------------------------------------------------ */
/* Press conference                                                    */
/* ------------------------------------------------------------------ */

function makePressConference(g: GameState, rng: Rng): Dilemma | null {
  const club = userClub(g);
  if (!club) return null;
  const r = g.lastUserResults[g.lastUserResults.length - 1];
  const squad = club.playerIds.map((id) => g.players[id]).filter(Boolean);
  const star = [...squad].sort((a, b) => b.ca - a.ca)[0];
  const opts: (() => Dilemma | null)[] = [];
  const id = () => nextId(g, 'pc');
  if (r) {
    const mineHome = r.homeId === club.id;
    const gf = mineHome ? r.homeGoals : r.awayGoals;
    const ga = mineHome ? r.awayGoals : r.homeGoals;
    const opp = g.clubs[mineHome ? r.awayId : r.homeId];
    const motm = Object.values(r.players).filter((p) => p.clubId === club.id).sort((a, b) => b.rating - a.rating)[0];
    const hero = motm ? g.players[motm.playerId] : null;
    if (gf > ga) {
      opts.push(() => ({
        id: id(), title: 'Press Conference',
        text: `"A ${gf}-${ga} win over ${opp.name}. Are you getting carried away in that dressing room?"`,
        options: [
          { label: '"Feet on the ground."', description: 'Calm and professional. The squad stays focused.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
          { label: '"We fear nobody."', description: 'The fans love it; the lads are fired up. Pressure rises.', effects: [{ kind: 'FAN_INTEREST', delta: 3 }, { kind: 'TEAM_ATMOSPHERE', delta: 3 }, { kind: 'BOARD', delta: -1 }] },
        ],
      }));
      if (hero) opts.push(() => ({
        id: id(), title: 'Press Conference',
        text: `"${fullName(hero)} was everywhere today. Is he the best player at the club?"`,
        options: [
          { label: `"He was magnificent."`, description: `${hero.lastName} glows. A few team-mates roll their eyes.`, effects: [{ kind: 'PLAYER_MORALE', playerId: hero.id, delta: 12 }, { kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
          { label: '"It was a team performance."', description: 'Nobody is singled out. Steady.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }, { kind: 'PLAYER_MORALE', playerId: hero.id, delta: 3 }] },
        ],
      }));
    } else if (gf < ga) {
      opts.push(() => ({
        id: id(), title: 'Press Conference',
        text: `"Beaten ${ga}-${gf} by ${opp.name}. The supporters are asking questions. Are you the right man for this job?"`,
        options: [
          { label: '"I back my players."', description: 'The squad appreciates it. The board wanted more fire.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 3 }, { kind: 'BOARD', delta: -1 }] },
          { label: '"Some of them let me down."', description: 'The board nods. The dressing room bristles.', effects: [{ kind: 'BOARD', delta: 2 }, { kind: 'TEAM_ATMOSPHERE', delta: -4 }] },
          { label: '"No comment."', description: 'You walk out. The papers will not be kind.', effects: [{ kind: 'FAN_INTEREST', delta: -2 }] },
        ],
      }));
    } else {
      opts.push(() => ({
        id: id(), title: 'Press Conference',
        text: `"${gf}-${ga} with ${opp.name}. A point gained or two dropped?"`,
        options: [
          { label: '"A fair result."', description: 'Measured. Nothing changes.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
          { label: '"We should have won."', description: 'Ambitious. The fans like it; the players feel the heat.', effects: [{ kind: 'FAN_INTEREST', delta: 2 }, { kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
        ],
      }));
    }
    if (club.rivalId && (opp.id === club.rivalId)) {
      opts.push(() => ({
        id: id(), title: 'Press Conference',
        text: `"Derby day is done. What does this fixture mean to you?"`,
        options: [
          { label: '"Everything. Ask the fans."', description: 'The terraces are with you.', effects: [{ kind: 'FAN_INTEREST', delta: 4 }] },
          { label: '"Just three points."', description: 'Cool-headed. The supporters wanted passion.', effects: [{ kind: 'FAN_INTEREST', delta: -2 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
        ],
      }));
    }
  }
  const pending = g.bids.find((b) => b.direction === 'INCOMING' && b.status === 'PENDING' && g.players[b.playerId]?.clubId === club.id);
  if (pending) {
    const p = g.players[pending.playerId];
    opts.push(() => ({
      id: id(), title: 'Press Conference',
      text: `"${g.clubs[pending.buyerClubId].name} have made a bid for ${fullName(p)}. Is he for sale?"`,
      options: [
        { label: '"He\'s going nowhere."', description: `${p.lastName} feels wanted. Selling him now would look bad.`, effects: [{ kind: 'PLAYER_MORALE', playerId: p.id, delta: 10 }, { kind: 'FAN_INTEREST', delta: 2 }] },
        { label: '"Everyone has a price."', description: 'The board likes your realism. The player is unsettled.', effects: [{ kind: 'PLAYER_MORALE', playerId: p.id, delta: -10 }, { kind: 'BOARD', delta: 2 }] },
      ],
    }));
  } else if (star && rng.chance(0.35)) {
    opts.push(() => ({
      id: id(), title: 'Press Conference',
      text: `"There are rumours bigger clubs are watching ${fullName(star)}. Your response?"`,
      options: [
        { label: '"Not for sale."', description: `${star.lastName} loves it.`, effects: [{ kind: 'PLAYER_MORALE', playerId: star.id, delta: 8 }] },
        { label: '"Rumours are rumours."', description: 'Non-committal. Nothing changes.', effects: [] },
      ],
    }));
  }
  if (opts.length === 0 || rng.chance(0.12)) return null; // some weeks the press have other things to do
  return rng.pick(opts)();
}

export function answerPress(g: GameState, idx: number): { ok: boolean; message: string } {
  const club = userClub(g);
  const pc = g.pressConference;
  if (!club || !pc) return { ok: false, message: 'The journalists have gone home.' };
  const opt = pc.options[idx];
  if (!opt) return { ok: false, message: 'No such answer.' };
  applyDilemmaEffects(g, club, opt.effects);
  g.pressConference = null;
  g.dayAfter.pressDone = true;
  return { ok: true, message: `Press conference: ${opt.label}` };
}
