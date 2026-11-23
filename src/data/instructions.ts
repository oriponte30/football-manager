/**
 * Individual player instructions. Each one nudges how a player behaves in the
 * match engine (who shoots, who creates, who defends, how fast they tire).
 * A player whose natural role suits the instruction gets a small extra boost.
 */
import type { Position } from '../types/player';
import type { PlayerRole } from '../types/tactics';

export type InstructionId =
  | 'HOLD_UP' | 'IN_BEHIND' | 'SHOOT_ON_SIGHT' | 'PRESS_HIGH'
  | 'CUT_INSIDE' | 'HUG_LINE'
  | 'GET_FORWARD' | 'HOLD_POSITION' | 'DICTATE'
  | 'OVERLAP' | 'STAY_BACK'
  | 'STEP_UP' | 'PLAY_OUT' | 'TACKLE_HARD'
  | 'SWEEP' | 'LONG_KICKS';

export interface InstructionMods {
  /** chance this player takes the shot */
  shoot?: number;
  /** headers / aerial threat */
  aerial?: number;
  /** chance this player is the creator */
  create?: number;
  /** midfield control weight */
  ctrl?: number;
  /** ball-recovery weight */
  res?: number;
  /** defensive weight */
  def?: number;
  /** fitness drain */
  drain?: number;
  /** injury risk */
  inj?: number;
}

export interface InstructionDef {
  id: InstructionId;
  label: string;
  desc: string;
  positions: Position[];
  mods: InstructionMods;
  suits: PlayerRole[];
}

export const INSTRUCTIONS: Record<InstructionId, InstructionDef> = {
  HOLD_UP: { id: 'HOLD_UP', label: 'Hold up the ball', desc: 'Back to goal, bring others into play.', positions: ['ST'], mods: { shoot: 0.85, aerial: 1.25, create: 1.35, ctrl: 1.2 }, suits: ['Target Man', 'False 9'] },
  IN_BEHIND: { id: 'IN_BEHIND', label: 'Run in behind', desc: 'Stretch the last line. More chances, more running.', positions: ['ST', 'LW', 'RW', 'CAM'], mods: { shoot: 1.25, create: 0.85, drain: 1.12 }, suits: ['Poacher', 'Inside Forward', 'Shadow Striker'] },
  SHOOT_ON_SIGHT: { id: 'SHOOT_ON_SIGHT', label: 'Shoot on sight', desc: 'Have a go from anywhere.', positions: ['ST', 'LW', 'RW', 'CAM', 'CM'], mods: { shoot: 1.4, create: 0.8 }, suits: ['Poacher', 'Shadow Striker', 'Box-to-Box'] },
  PRESS_HIGH: { id: 'PRESS_HIGH', label: 'Close down defenders', desc: 'Harry the back line. Wins the ball high, tires quickly.', positions: ['ST', 'LW', 'RW', 'CAM'], mods: { res: 1.5, drain: 1.2, inj: 1.1 }, suits: ['False 9', 'Inside Forward'] },
  CUT_INSIDE: { id: 'CUT_INSIDE', label: 'Cut inside', desc: 'Come off the flank onto the stronger foot.', positions: ['LW', 'RW'], mods: { shoot: 1.3, create: 0.95 }, suits: ['Inside Forward'] },
  HUG_LINE: { id: 'HUG_LINE', label: 'Hug the touchline', desc: 'Stay wide and whip crosses in.', positions: ['LW', 'RW', 'LB', 'RB'], mods: { create: 1.3, shoot: 0.8 }, suits: ['Touchline Winger', 'Attacking Wingback'] },
  GET_FORWARD: { id: 'GET_FORWARD', label: 'Get forward', desc: 'Late runs into the box.', positions: ['CM', 'CDM', 'CAM'], mods: { shoot: 1.35, create: 1.1, def: 0.8, drain: 1.1 }, suits: ['Box-to-Box', 'Shadow Striker'] },
  HOLD_POSITION: { id: 'HOLD_POSITION', label: 'Hold position', desc: 'Screen the defence, never get caught upfield.', positions: ['CM', 'CDM', 'LB', 'RB'], mods: { def: 1.3, res: 1.1, shoot: 0.6, create: 0.8, drain: 0.92 }, suits: ['Ball-Winner', 'Stay-Back Fullback'] },
  DICTATE: { id: 'DICTATE', label: 'Dictate the tempo', desc: 'Everything goes through him.', positions: ['CM', 'CDM', 'CAM'], mods: { ctrl: 1.35, create: 1.25, def: 0.9 }, suits: ['Deep Playmaker', 'Playmaker'] },
  OVERLAP: { id: 'OVERLAP', label: 'Overlap', desc: 'Bomb on past the winger.', positions: ['LB', 'RB'], mods: { create: 1.4, def: 0.8, drain: 1.15 }, suits: ['Attacking Wingback'] },
  STAY_BACK: { id: 'STAY_BACK', label: 'Stay back', desc: 'Defend first; leave the attacking to others.', positions: ['LB', 'RB', 'CB'], mods: { def: 1.25, create: 0.6, drain: 0.9 }, suits: ['Stay-Back Fullback', 'Stopper'] },
  STEP_UP: { id: 'STEP_UP', label: 'Step up', desc: 'Win it early in front of the striker.', positions: ['CB', 'CDM'], mods: { res: 1.35, def: 1.05, inj: 1.1 }, suits: ['Stopper', 'Ball-Winner'] },
  PLAY_OUT: { id: 'PLAY_OUT', label: 'Play out from the back', desc: 'Carry and pass it out instead of clearing.', positions: ['CB', 'GK'], mods: { ctrl: 1.4, create: 1.2, def: 0.92 }, suits: ['Ball-Playing Defender', 'Sweeper Keeper'] },
  TACKLE_HARD: { id: 'TACKLE_HARD', label: 'Tackle harder', desc: 'Let them know you are there. Cards and knocks follow.', positions: ['CB', 'LB', 'RB', 'CDM', 'CM'], mods: { res: 1.3, def: 1.1, inj: 1.25 }, suits: ['Ball-Winner', 'Stopper'] },
  SWEEP: { id: 'SWEEP', label: 'Sweep behind', desc: 'Come off the line to clear through balls.', positions: ['GK'], mods: { def: 1.2, res: 1.2 }, suits: ['Sweeper Keeper'] },
  LONG_KICKS: { id: 'LONG_KICKS', label: 'Long kicks', desc: 'Go long to the big man.', positions: ['GK'], mods: { ctrl: 0.85, create: 1.15 }, suits: ['Shot-Stopper'] },
};

export function instructionsFor(pos: Position): InstructionDef[] {
  return Object.values(INSTRUCTIONS).filter((i) => i.positions.includes(pos));
}
