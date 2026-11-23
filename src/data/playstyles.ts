/**
 * Player playstyles: each position has several archetypes that skew the stat
 * distribution, set a preferred tactical role and hint at fitting traits.
 * Rolled at random for every generated player, so no two worlds share a squad.
 */
import type { Position, StatKey, Trait } from '../types/player';
import type { PlayerRole } from '../types/tactics';

export interface Playstyle {
  name: string;
  role: PlayerRole;
  /** stat deltas applied before the OVR is normalised back to target */
  bias: Partial<Record<StatKey, number>>;
  /** traits that fit this style (raised odds, not guaranteed) */
  traitHints: Trait[];
  weight: number;
}

const S = (name: string, role: PlayerRole, bias: Partial<Record<StatKey, number>>, traitHints: Trait[] = [], weight = 1): Playstyle => ({
  name, role, bias, traitHints, weight,
});

const FULLBACK = [
  S('Defensive Fullback', 'Stay-Back Fullback', { defending: 7, physical: 3, dribbling: -5, shooting: -4 }, ['Reckless Tackler', 'Long-Throw Specialist']),
  S('Overlapping Fullback', 'Attacking Wingback', { pace: 7, passing: 4, defending: -5 }, ['Tireless Engine']),
  S('Inverted Fullback', 'Stay-Back Fullback', { passing: 7, dribbling: 2, pace: -4 }, ['Consistent'], 0.6),
];
const WINGER = [
  S('Speed Merchant', 'Touchline Winger', { pace: 10, dribbling: 2, passing: -5, physical: -3 }, ['Super-Sub']),
  S('Crossing Specialist', 'Touchline Winger', { passing: 8, pace: 2, shooting: -5 }, ['Set-Piece Ace']),
  S('Inside Forward', 'Inside Forward', { shooting: 7, dribbling: 4, passing: -5 }, ['Poacher', 'Selfish']),
  S('Trickster', 'Inside Forward', { dribbling: 9, physical: -5 }, ['Selfish', 'Big Game Player'], 0.7),
];

export const PLAYSTYLES: Record<Position, Playstyle[]> = {
  GK: [
    S('Shot-Stopper', 'Shot-Stopper', { reflexes: 6, positioning: 2, kicking: -6 }, ['Clutch'], 1.4),
    S('Sweeper Keeper', 'Sweeper Keeper', { kicking: 8, positioning: 3, handling: -4 }, []),
    S('Commanding Keeper', 'Shot-Stopper', { handling: 5, physical: 5, reflexes: -3 }, ['Consistent']),
  ],
  CB: [
    S('Stopper', 'Stopper', { defending: 5, physical: 6, passing: -5, pace: -2 }, ['Reckless Tackler', 'Long-Throw Specialist'], 1.3),
    S('Ball-Playing Defender', 'Ball-Playing Defender', { passing: 8, dribbling: 3, physical: -4 }, ['Consistent']),
    S('Rapid Recovery CB', 'Stopper', { pace: 9, physical: -2, passing: -3 }, []),
    S('Aerial Colossus', 'Stopper', { physical: 9, pace: -6 }, ['Set-Piece Ace'], 0.7),
  ],
  LB: FULLBACK,
  RB: FULLBACK,
  CDM: [
    S('Destroyer', 'Ball-Winner', { defending: 7, physical: 5, passing: -5, dribbling: -3 }, ['Reckless Tackler', 'Tireless Engine'], 1.2),
    S('Regista', 'Deep Playmaker', { passing: 9, defending: -3, physical: -3 }, ['Consistent']),
    S('Anchor', 'Ball-Winner', { defending: 4, physical: 3, pace: -4 }, ['Consistent']),
  ],
  CM: [
    S('Box-to-Box', 'Box-to-Box', { physical: 5, pace: 3, passing: -3 }, ['Tireless Engine'], 1.2),
    S('Deep-Lying Playmaker', 'Deep Playmaker', { passing: 8, pace: -4, physical: -2 }, ['Set-Piece Ace', 'Consistent']),
    S('Ball-Winning Midfielder', 'Ball-Winner', { defending: 8, dribbling: -4, shooting: -3 }, ['Reckless Tackler']),
    S('Goalscoring Midfielder', 'Box-to-Box', { shooting: 8, defending: -5 }, ['Clutch', 'Big Game Player'], 0.7),
  ],
  CAM: [
    S('Classic No. 10', 'Playmaker', { passing: 8, dribbling: 3, physical: -6, pace: -2 }, ['Set-Piece Ace'], 1.2),
    S('Shadow Striker', 'Shadow Striker', { shooting: 8, pace: 2, passing: -5 }, ['Poacher', 'Clutch']),
    S('Dribbling Wizard', 'Playmaker', { dribbling: 9, physical: -5 }, ['Selfish', 'Big Game Player'], 0.8),
  ],
  LW: WINGER,
  RW: WINGER,
  ST: [
    S('Poacher', 'Poacher', { shooting: 8, pace: 2, passing: -5, physical: -2 }, ['Poacher', 'Super-Sub'], 1.2),
    S('Target Man', 'Target Man', { physical: 10, pace: -6, dribbling: -3 }, ['Set-Piece Ace', 'Big Game Player']),
    S('False 9', 'False 9', { passing: 7, dribbling: 4, shooting: -4, physical: -4 }, ['Consistent'], 0.7),
    S('Pacey Forward', 'Poacher', { pace: 9, dribbling: 2, physical: -4, passing: -3 }, ['Selfish']),
    S('Complete Forward', 'Target Man', { shooting: 3, physical: 3, passing: 2, pace: -3, dribbling: -3 }, ['Clutch'], 0.6),
  ],
};
