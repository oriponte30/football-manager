import type { ArchetypeId } from '../types/club';

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  pitch: string;
  pros: string[];
  cons: string[];
  /** squad OVR centre */
  squadOvr: number;
  squadSpread: number;
  /** age band of the senior squad */
  ageMin: number;
  ageMax: number;
  reputation: number;
  capacity: number;
  bank: number;
  wageMult: number;
  boardStart: number;
  boardPatience: number;
  /** staff stars (internal 10..50) */
  staff: { HEAD_COACH: number; CHIEF_SCOUT: number; YOUTH_DIRECTOR: number; PHYSIO: number };
  homeBoost: number;
  fanInterest: number;
  /** number of raw 18-year-old prospects */
  prospects: number;
  extremeTraits: boolean;
  boardGoal: 'PROMOTION' | 'PLAYOFF' | 'TOP_HALF' | 'MIDTABLE' | 'SURVIVAL';
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  FALLEN_GIANT: {
    id: 'FALLEN_GIANT',
    name: 'The Fallen Giant',
    pitch: 'Former champions now rotting in the third tier. The ground still roars.',
    pros: ['High reputation', 'Big stadium & gate receipts', 'Experienced squad'],
    cons: ['Crippling wage bill', 'Aging squad', '$0 transfer budget'],
    squadOvr: 57, squadSpread: 5, ageMin: 27, ageMax: 34,
    reputation: 48, capacity: 31000, bank: 0, wageMult: 1.9,
    boardStart: 60, boardPatience: 0.9,
    staff: { HEAD_COACH: 25, CHIEF_SCOUT: 25, YOUTH_DIRECTOR: 20, PHYSIO: 25 },
    homeBoost: 1.0, fanInterest: 58, prospects: 0, extremeTraits: false, boardGoal: 'TOP_HALF',
  },
  TINY_UNDERDOG: {
    id: 'TINY_UNDERDOG',
    name: 'The Tiny Underdog',
    pitch: 'A village club with a tea hut and a dream. The board will wait for you.',
    pros: ['Very patient board', 'Clean, tiny wage sheet', 'Healthy bank'],
    cons: ['1★ staff across the board', 'Tiny stadium', 'Low reputation'],
    squadOvr: 54, squadSpread: 5, ageMin: 20, ageMax: 31,
    reputation: 14, capacity: 4200, bank: 650000, wageMult: 0.55,
    boardStart: 70, boardPatience: 0.5,
    staff: { HEAD_COACH: 10, CHIEF_SCOUT: 10, YOUTH_DIRECTOR: 10, PHYSIO: 10 },
    homeBoost: 1.0, fanInterest: 45, prospects: 0, extremeTraits: false, boardGoal: 'TOP_HALF',
  },
  YOUTH_GAMBLE: {
    id: 'YOUTH_GAMBLE',
    name: 'The Youth Gamble',
    pitch: 'A famous academy with a dreadful first team. The kids could be special.',
    pros: ['2★ Youth Director', '2–3 raw 18-year-olds (72–78 potential)', 'Cheap wages'],
    cons: ['Relegation-level senior XI (47–53)', '1★ Head Coach', 'Poaching risk on the kids'],
    squadOvr: 49, squadSpread: 3, ageMin: 19, ageMax: 30,
    reputation: 24, capacity: 9000, bank: 300000, wageMult: 0.7,
    boardStart: 66, boardPatience: 0.6,
    staff: { HEAD_COACH: 10, CHIEF_SCOUT: 20, YOUTH_DIRECTOR: 20, PHYSIO: 15 },
    homeBoost: 1.0, fanInterest: 50, prospects: 3, extremeTraits: false, boardGoal: 'SURVIVAL',
  },
  VOLATILE_OWNER: {
    id: 'VOLATILE_OWNER',
    name: 'The Volatile Owner',
    pitch: 'A flamboyant tycoon has bought the club. Money talks. So does he. Loudly.',
    pros: ['Strongest Tier 3 transfer budget', 'Decent facilities'],
    cons: ['Impatient board demands promotion', 'High sacking risk'],
    squadOvr: 55.5, squadSpread: 5, ageMin: 21, ageMax: 32,
    reputation: 30, capacity: 12000, bank: 2400000, wageMult: 1.0,
    boardStart: 52, boardPatience: 1.9,
    staff: { HEAD_COACH: 20, CHIEF_SCOUT: 20, YOUTH_DIRECTOR: 15, PHYSIO: 20 },
    homeBoost: 1.0, fanInterest: 52, prospects: 0, extremeTraits: false, boardGoal: 'PROMOTION',
  },
  CULT_CLUB: {
    id: 'CULT_CLUB',
    name: 'The Cult Club',
    pitch: 'Pirate flags, a pitch on a slope and the loudest 6,000 fans in the country.',
    pros: ['Huge home-field advantage', 'Passionate fans'],
    cons: ['Bizarre, unbalanced roster', 'Extreme traits everywhere'],
    squadOvr: 52.5, squadSpread: 6, ageMin: 19, ageMax: 34,
    reputation: 26, capacity: 6500, bank: 420000, wageMult: 0.85,
    boardStart: 62, boardPatience: 0.9,
    staff: { HEAD_COACH: 20, CHIEF_SCOUT: 15, YOUTH_DIRECTOR: 15, PHYSIO: 15 },
    homeBoost: 1.6, fanInterest: 72, prospects: 0, extremeTraits: true, boardGoal: 'MIDTABLE',
  },
};

export const ARCHETYPE_IDS: ArchetypeId[] = ['FALLEN_GIANT', 'TINY_UNDERDOG', 'YOUTH_GAMBLE', 'VOLATILE_OWNER', 'CULT_CLUB'];
