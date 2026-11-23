import type { GameState } from '../types/world';

export function nextId(g: Pick<GameState, 'idCounter'>, prefix: string): string {
  g.idCounter += 1;
  return `${prefix}${g.idCounter.toString(36)}`;
}
