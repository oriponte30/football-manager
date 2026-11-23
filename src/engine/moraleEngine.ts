/** Team atmosphere, individual morale and 1-click dressing room dilemmas. */
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Dilemma, DilemmaEffect } from '../types/transfers';
import type { PlayerMatchStats } from '../types/match';
import { clamp, type Rng } from './rng';
import { fullName, moraleLevel } from './ratings';
import { nextId } from './ids';
import { dilemmaTemplates } from './dilemmaPool';

export function updateMoraleAfterWeek(g: GameState, club: Club, results: ('W' | 'D' | 'L')[], weekStats: Record<string, PlayerMatchStats>): void {
  const resDelta = results.reduce((a, r) => a + (r === 'W' ? 3 : r === 'L' ? -3 : 0), 0);
  club.teamAtmosphere = clamp(club.teamAtmosphere + resDelta * 1.3 + (55 - club.teamAtmosphere) * 0.06, 0, 100);
  const squad = club.playerIds.map((id) => g.players[id]).filter(Boolean);
  const sortedCa = squad.map((p) => p.ca).sort((a, b) => b - a);
  const keyCut = sortedCa[Math.min(13, sortedCa.length - 1)] ?? 0;
  for (const p of squad) {
    const ms = weekStats[p.id];
    let d = resDelta * 0.8;
    if (ms) {
      d += ms.started ? 2 : 0.8;
      if (ms.rating >= 7.5) d += 2;
      if (ms.rating <= 5.2) d -= 1.5;
    } else if (p.injuryWeeks === 0) {
      d -= p.ca >= keyCut ? 3.5 : 1;
    }
    if (p.contract.yearsLeft <= 1 && g.season.matchweek > 18 && p.ca >= keyCut) d -= 1;
    d += (55 - p.moraleValue) * 0.05 + (club.teamAtmosphere - 50) * 0.03;
    p.moraleValue = clamp(p.moraleValue + d, 0, 100);
  }
}

export function maybeCreateDilemma(g: GameState, rng: Rng, club: Club): Dilemma | null {
  if (g.dilemma || !rng.chance(0.15)) return null;
  const squad = club.playerIds.map((id) => g.players[id]).filter((p) => p && p.injuryWeeks === 0);
  if (squad.length < 5) return null;
  const pickUnhappy = squad.filter((p) => moraleLevel(p.moraleValue) <= 1).sort((a, b) => b.ca - a.ca)[0];
  const veteran = [...squad].sort((a, b) => b.age - a.age || b.ca - a.ca)[0];
  const star = [...squad].sort((a, b) => b.ca - a.ca)[0];
  const templates: (() => Dilemma | null)[] = [
    () => pickUnhappy ? {
      id: nextId(g, 'd'),
      title: 'Minutes Demand',
      text: `${fullName(pickUnhappy)} has knocked on your office door. He wants guaranteed starts or he'll go to the papers.`,
      options: [
        { label: 'Promise him starts', description: 'He perks up; others grumble about favouritism.', effects: [{ kind: 'PLAYER_MORALE', playerId: pickUnhappy.id, delta: 28 }, { kind: 'TEAM_ATMOSPHERE', delta: -3 }] },
        { label: 'Tell him to earn it', description: 'Squad respects it; he sulks.', effects: [{ kind: 'PLAYER_MORALE', playerId: pickUnhappy.id, delta: -15 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
      ],
    } : null,
    () => ({
      id: nextId(g, 'd'),
      title: 'Squad Night Out',
      text: 'The senior lads want a team night out on the town after Saturday. The physio is pulling a face.',
      options: [
        { label: 'Let them go', description: 'Bonding! But sore heads on Monday.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 9 }, { kind: 'SQUAD_FITNESS', delta: -8 }] },
        { label: 'Ban it', description: 'Professional, but the mood dips.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: -5 }] },
      ],
    }),
    () => veteran ? {
      id: nextId(g, 'd'),
      title: 'Dressing Room Lawyer',
      text: `Veteran ${fullName(veteran)} questioned your tactics in front of the whole squad at training.`,
      options: [
        { label: 'Back him publicly', description: 'He feels valued; your authority takes a dent.', effects: [{ kind: 'PLAYER_MORALE', playerId: veteran.id, delta: 18 }, { kind: 'TEAM_ATMOSPHERE', delta: -2 }] },
        { label: 'Fine him a week\'s wages', description: 'Discipline restored. He is livid.', effects: [{ kind: 'PLAYER_MORALE', playerId: veteran.id, delta: -25 }, { kind: 'TEAM_ATMOSPHERE', delta: 4 }, { kind: 'BANK', delta: veteran.contract.wage }] },
      ],
    } : null,
    () => star ? {
      id: nextId(g, 'd'),
      title: 'Pay Rise Request',
      text: `Your best player, ${fullName(star)}, says rival clubs are sniffing around. His agent wants a 20% raise.`,
      options: [
        { label: 'Give him the raise', description: 'Wage bill up, star stays sweet.', effects: [{ kind: 'WAGE_RISE', playerId: star.id, pct: 0.2 }, { kind: 'PLAYER_MORALE', playerId: star.id, delta: 22 }] },
        { label: 'Refuse', description: 'Saves cash. He may push for a move.', effects: [{ kind: 'PLAYER_MORALE', playerId: star.id, delta: -22 }] },
      ],
    } : null,
    () => ({
      id: nextId(g, 'd'),
      title: 'Charity Match',
      text: 'The supporters\' club asks the first team to play a charity match at the local hospital ground.',
      options: [
        { label: 'Accept', description: 'Fans love it. Legs get heavier.', effects: [{ kind: 'FAN_INTEREST', delta: 5 }, { kind: 'SQUAD_FITNESS', delta: -6 }] },
        { label: 'Politely decline', description: 'Fresh legs, a few raised eyebrows.', effects: [{ kind: 'FAN_INTEREST', delta: -2 }] },
      ],
    }),
    () => ({
      id: nextId(g, 'd'),
      title: 'Kit Sponsor Stunt',
      text: 'A local double-glazing firm will pay for a cringe-worthy photo shoot with the squad in their windows.',
      options: [
        { label: 'Take the money', description: '+$60K, players roll their eyes.', effects: [{ kind: 'BANK', delta: 60000 }, { kind: 'TEAM_ATMOSPHERE', delta: -3 }] },
        { label: 'Refuse', description: 'Dignity intact. Board less impressed.', effects: [{ kind: 'BOARD', delta: -2 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      ],
    }),
  ];
  const all = [...templates, ...dilemmaTemplates(g, club)];
  const recent = g.dilemmaHistory ?? [];
  // try the ones we haven't seen lately first, then anything
  const order = rng.shuffle([...all]);
  const fresh: Dilemma[] = [];
  const stale: Dilemma[] = [];
  for (const t of order) {
    const d = t();
    if (!d) continue;
    (recent.includes(d.title) ? stale : fresh).push(d);
    if (fresh.length) break;
  }
  const pick = fresh[0] ?? stale[0] ?? null;
  if (pick) g.dilemmaHistory = [...recent, pick.title].slice(-10);
  return pick;
}

export function applyDilemmaEffects(g: GameState, club: Club, effects: DilemmaEffect[]): void {
  for (const e of effects) {
    switch (e.kind) {
      case 'PLAYER_MORALE': {
        const p = g.players[e.playerId];
        if (p) p.moraleValue = clamp(p.moraleValue + e.delta, 0, 100);
        break;
      }
      case 'TEAM_ATMOSPHERE':
        club.teamAtmosphere = clamp(club.teamAtmosphere + e.delta, 0, 100);
        break;
      case 'SQUAD_FITNESS':
        for (const id of club.playerIds) {
          const p = g.players[id];
          if (p) p.fitness = clamp(p.fitness + e.delta, 30, 100);
        }
        break;
      case 'BANK':
        club.finances.bank += e.delta;
        club.finances.ledger.sales += Math.max(0, e.delta);
        break;
      case 'FAN_INTEREST':
        club.fanInterest = clamp(club.fanInterest + e.delta, 0, 100);
        break;
      case 'BOARD':
        club.board.value = clamp(club.board.value + e.delta, 0, 100);
        break;
      case 'SQUAD_MORALE':
        for (const id of club.playerIds) {
          const p = g.players[id];
          if (p) p.moraleValue = clamp(p.moraleValue + e.delta, 0, 100);
        }
        break;
      case 'PLAYER_FITNESS': {
        const p = g.players[e.playerId];
        if (p) p.fitness = clamp(p.fitness + e.delta, 30, 100);
        break;
      }
      case 'WAGE_RISE': {
        const p = g.players[e.playerId];
        if (p) p.contract.wage = Math.round(p.contract.wage * (1 + e.pct) / 10) * 10;
        break;
      }
    }
  }
}

/** Fan interest: newspaper back-page buzz meter. */
export function fanInterestAfterMatch(club: Club, gf: number, ga: number, isDerby: boolean, competition: string): void {
  let d = 0;
  if (gf > ga) d += 2 + (isDerby ? 4 : 0) + (club.streak >= 3 ? 1 : 0);
  else if (gf < ga) d -= 2 + (isDerby ? 3 : 0) + (club.streak <= -3 ? 1.5 : 0);
  if (gf + ga >= 4) d += 1;
  if (gf === 0 && ga === 0) d -= 2;
  if (competition !== 'LEAGUE' && gf > ga) d += 2;
  d += (50 - club.fanInterest) * 0.02;
  club.fanInterest = clamp(club.fanInterest + d, 0, 100);
}
