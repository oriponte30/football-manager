import type { FormationDef, FormationId, PlayerRole, Duty, RoleAssignment } from '../types/tactics';
import type { Position } from '../types/player';

export const FORMATIONS: Record<FormationId, FormationDef> = {
  '4-4-2': {
    id: '4-4-2',
    slots: [
      { pos: 'GK', x: 50, y: 5 },
      { pos: 'LB', x: 12, y: 24 }, { pos: 'CB', x: 37, y: 20 }, { pos: 'CB', x: 63, y: 20 }, { pos: 'RB', x: 88, y: 24 },
      { pos: 'LW', x: 12, y: 52 }, { pos: 'CM', x: 37, y: 48 }, { pos: 'CM', x: 63, y: 48 }, { pos: 'RW', x: 88, y: 52 },
      { pos: 'ST', x: 37, y: 80 }, { pos: 'ST', x: 63, y: 80 },
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    slots: [
      { pos: 'GK', x: 50, y: 5 },
      { pos: 'LB', x: 12, y: 24 }, { pos: 'CB', x: 37, y: 20 }, { pos: 'CB', x: 63, y: 20 }, { pos: 'RB', x: 88, y: 24 },
      { pos: 'CM', x: 28, y: 48 }, { pos: 'CDM', x: 50, y: 40 }, { pos: 'CM', x: 72, y: 48 },
      { pos: 'LW', x: 15, y: 76 }, { pos: 'ST', x: 50, y: 84 }, { pos: 'RW', x: 85, y: 76 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    slots: [
      { pos: 'GK', x: 50, y: 5 },
      { pos: 'LB', x: 12, y: 24 }, { pos: 'CB', x: 37, y: 20 }, { pos: 'CB', x: 63, y: 20 }, { pos: 'RB', x: 88, y: 24 },
      { pos: 'CDM', x: 37, y: 40 }, { pos: 'CDM', x: 63, y: 40 },
      { pos: 'LW', x: 15, y: 64 }, { pos: 'CAM', x: 50, y: 64 }, { pos: 'RW', x: 85, y: 64 },
      { pos: 'ST', x: 50, y: 86 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    slots: [
      { pos: 'GK', x: 50, y: 5 },
      { pos: 'CB', x: 25, y: 20 }, { pos: 'CB', x: 50, y: 18 }, { pos: 'CB', x: 75, y: 20 },
      { pos: 'LB', x: 8, y: 50 }, { pos: 'CM', x: 32, y: 46 }, { pos: 'CDM', x: 50, y: 38 }, { pos: 'CM', x: 68, y: 46 }, { pos: 'RB', x: 92, y: 50 },
      { pos: 'ST', x: 37, y: 82 }, { pos: 'ST', x: 63, y: 82 },
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    slots: [
      { pos: 'GK', x: 50, y: 5 },
      { pos: 'LB', x: 8, y: 30 }, { pos: 'CB', x: 28, y: 20 }, { pos: 'CB', x: 50, y: 18 }, { pos: 'CB', x: 72, y: 20 }, { pos: 'RB', x: 92, y: 30 },
      { pos: 'CM', x: 28, y: 50 }, { pos: 'CM', x: 50, y: 46 }, { pos: 'CM', x: 72, y: 50 },
      { pos: 'ST', x: 37, y: 82 }, { pos: 'ST', x: 63, y: 82 },
    ],
  },
};

export const FORMATION_IDS: FormationId[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2'];

/** Allowed roles for each pitch position. */
export const ROLES_BY_POSITION: Record<Position, PlayerRole[]> = {
  ST: ['Poacher', 'Target Man', 'False 9'],
  LW: ['Touchline Winger', 'Inside Forward'],
  RW: ['Touchline Winger', 'Inside Forward'],
  CAM: ['Playmaker', 'Shadow Striker'],
  CM: ['Box-to-Box', 'Ball-Winner', 'Deep Playmaker'],
  CDM: ['Ball-Winner', 'Deep Playmaker', 'Box-to-Box'],
  LB: ['Stay-Back Fullback', 'Attacking Wingback'],
  RB: ['Stay-Back Fullback', 'Attacking Wingback'],
  CB: ['Stopper', 'Ball-Playing Defender'],
  GK: ['Shot-Stopper', 'Sweeper Keeper'],
};

export function defaultDuty(pos: Position): Duty {
  if (pos === 'GK' || pos === 'CB' || pos === 'CDM') return 'DEFEND';
  if (pos === 'ST' || pos === 'LW' || pos === 'RW' || pos === 'CAM') return 'ATTACK';
  return 'SUPPORT';
}

export function defaultRoles(formation: FormationId): RoleAssignment[] {
  return FORMATIONS[formation].slots.map((s) => ({ role: ROLES_BY_POSITION[s.pos][0], duty: defaultDuty(s.pos) }));
}

/** Position compatibility multiplier for out-of-position penalties. */
const NEIGHBOURS: Record<Position, Position[]> = {
  GK: [],
  CB: ['CDM', 'LB', 'RB'],
  LB: ['RB', 'CB', 'LW'],
  RB: ['LB', 'CB', 'RW'],
  CDM: ['CM', 'CB'],
  CM: ['CDM', 'CAM'],
  CAM: ['CM', 'ST', 'LW', 'RW'],
  LW: ['RW', 'CAM', 'LB'],
  RW: ['LW', 'CAM', 'RB'],
  ST: ['CAM', 'LW', 'RW'],
};

/** Effective-rating multiplier for playing a slot: natural 1.00, secondary 0.965, adjacent 0.89, unrelated 0.72, keeper swap 0.45. */
export function positionFit(natural: Position, slot: Position, secondary?: Position | null): number {
  if (natural === slot) return 1;
  if (natural === 'GK' || slot === 'GK') return 0.45;
  if (secondary && secondary === slot) return 0.965;
  if (NEIGHBOURS[natural].includes(slot)) return 0.89;
  return 0.72;
}

/** Tier of fit, for colour coding: 0 natural, 1 secondary, 2 adjacent, 3 unrelated/keeper swap. */
export function fitTier(natural: Position, slot: Position, secondary?: Position | null): 0 | 1 | 2 | 3 {
  if (natural === slot) return 0;
  if (natural === 'GK' || slot === 'GK') return 3;
  if (secondary && secondary === slot) return 1;
  return NEIGHBOURS[natural].includes(slot) ? 2 : 3;
}

export const SECONDARY_OPTIONS: Record<Position, Position[]> = {
  GK: [], CB: ['CDM', 'LB', 'RB'], LB: ['RB', 'CB', 'LW'], RB: ['LB', 'CB', 'RW'], CDM: ['CM', 'CB'], CM: ['CDM', 'CAM'],
  CAM: ['CM', 'LW', 'RW', 'ST'], LW: ['RW', 'ST', 'CAM'], RW: ['LW', 'ST', 'CAM'], ST: ['LW', 'RW', 'CAM'],
};

export const POSITION_GROUP: Record<Position, 'GK' | 'DEF' | 'MID' | 'ATT'> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LW: 'ATT', RW: 'ATT', ST: 'ATT',
};
