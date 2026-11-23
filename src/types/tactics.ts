import type { Position } from './player';

export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2';

export type Mentality = 'DEFENSIVE' | 'BALANCED' | 'ATTACKING';
export type PassingStyle = 'SHORT' | 'BALANCED' | 'DIRECT';
export type Pressing = 'LOW' | 'MID' | 'HIGH';
export type AttackingFocus = 'WINGS' | 'BALANCED' | 'MIDDLE';

export interface TeamDials {
  mentality: Mentality;
  passingStyle: PassingStyle;
  pressing: Pressing;
  attackingFocus: AttackingFocus;
}

export type PlayerRole =
  | 'Poacher' | 'Target Man' | 'False 9'
  | 'Touchline Winger' | 'Inside Forward'
  | 'Playmaker' | 'Shadow Striker'
  | 'Ball-Winner' | 'Deep Playmaker' | 'Box-to-Box'
  | 'Stay-Back Fullback' | 'Attacking Wingback'
  | 'Stopper' | 'Ball-Playing Defender'
  | 'Shot-Stopper' | 'Sweeper Keeper';

export type Duty = 'DEFEND' | 'SUPPORT' | 'ATTACK';

export interface RoleAssignment {
  role: PlayerRole;
  duty: Duty;
}

export interface FormationSlot {
  pos: Position;
  /** 0..100 across pitch width */
  x: number;
  /** 0..100 from own goal (0) to opposition goal (100) */
  y: number;
}

export interface FormationDef {
  id: FormationId;
  slots: FormationSlot[];
}

export type TeamTrainingFocus = 'BALANCED' | 'ATTACKING' | 'DEFENDING' | 'PHYSICAL';

export interface TacticalSetup {
  formation: FormationId;
  dials: TeamDials;
  /** 11 slots, player ids (null = empty, auto-filled at kick-off) */
  lineup: (string | null)[];
  roles: RoleAssignment[];
  /** up to 7 substitutes */
  bench: string[];
  trainingFocus: TeamTrainingFocus;
  /** 2–3 tagged player ids for individual focus */
  trainingTags: string[];
}
