/** One-on-one training drills: once a week the manager works with a single player. */
import type { StatKey } from '../types/player';

export type DrillKind = 'FINISHING' | 'PASSING' | 'DRIBBLING' | 'TACKLING' | 'SPRINTS' | 'STRENGTH' | 'SHOT_STOPPING' | 'DISTRIBUTION';

export interface DrillDef {
  id: DrillKind;
  label: string;
  blurb: string;
  stats: StatKey[];
  gkOnly?: boolean;
  outfieldOnly?: boolean;
  /** fitness cost of the session */
  fitness: number;
}

export const DRILLS: DrillDef[] = [
  { id: 'FINISHING', label: 'Finishing', blurb: 'An hour of one-v-ones and volleys after training.', stats: ['shooting'], outfieldOnly: true, fitness: 6 },
  { id: 'PASSING', label: 'Passing', blurb: 'Rondo work, switches of play, weight of pass.', stats: ['passing'], outfieldOnly: true, fitness: 4 },
  { id: 'DRIBBLING', label: 'Ball Mastery', blurb: 'Cones, close control and the drop of the shoulder.', stats: ['dribbling'], outfieldOnly: true, fitness: 5 },
  { id: 'TACKLING', label: 'Defending', blurb: 'Body shape, timing the tackle, reading the runner.', stats: ['defending'], outfieldOnly: true, fitness: 6 },
  { id: 'SPRINTS', label: 'Sprints', blurb: 'Hill runs and resisted sprints with the fitness coach.', stats: ['pace'], fitness: 10 },
  { id: 'STRENGTH', label: 'Gym', blurb: 'Weights and core work. Builds the engine.', stats: ['physical'], fitness: 8 },
  { id: 'SHOT_STOPPING', label: 'Shot-Stopping', blurb: 'Reaction saves and handling crosses.', stats: ['reflexes', 'handling'], gkOnly: true, fitness: 5 },
  { id: 'DISTRIBUTION', label: 'Distribution', blurb: 'Kicking, throwing and starting attacks.', stats: ['kicking', 'positioning'], gkOnly: true, fitness: 3 },
];
