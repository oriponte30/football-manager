import { buildStats, generatePlayer } from '../playerGenerator';
import { FORMATIONS, defaultRoles } from '../../data/formations';
import { ovrFor } from '../ratings';
import { createRng } from '../rng';
import type { GameState } from '../../types/world';
import type { TeamSheet } from '../matchEngine';

export function makeTeam(id: string, ovr: number, seed: number): TeamSheet {
  const rng = createRng(seed);
  const g = { idCounter: seed * 1000 } as GameState;
  const slots = FORMATIONS['4-4-2'].slots;
  const roles = defaultRoles('4-4-2');
  const starters = slots.map((s, i) => {
    const p = generatePlayer(g, rng, { nationality: 'ENG', position: s.pos, age: 26, targetOvr: ovr, clubId: id, tier: 1 });
    p.stats = buildStats(rng, s.pos, ovr, 'ENG', false);
    p.ca = ovrFor(p.stats, s.pos);
    p.traits = [];
    p.moraleValue = 50;
    return { player: p, slot: s.pos, role: roles[i] };
  });
  const bench = ['GK', 'CB', 'CM', 'ST', 'LW', 'RB', 'CDM'].map((pos) => {
    const p = generatePlayer(g, rng, { nationality: 'ENG', position: pos as 'GK', age: 26, targetOvr: ovr - 3, clubId: id, tier: 1 });
    p.traits = [];
    return p;
  });
  return {
    clubId: id, name: id, formation: '4-4-2',
    dials: { mentality: 'BALANCED', passingStyle: 'BALANCED', pressing: 'MID', attackingFocus: 'BALANCED' },
    familiarity: 100, atmosphere: 50, homeBoost: 1, fanInterest: 50, starters, bench,
  };
}

