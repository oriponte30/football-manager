import { type GameState } from '../types/world';

export interface SaveSummary {
  manager: string;
  club: string;
  season: number;
  matchweek: number;
  saveVersion: number;
}

/** a career exists once a job is accepted; the job-offer screen is not worth saving */
export function hasCareer(g: GameState | null): g is GameState {
  return !!g && g.status !== 'ONBOARDING' && !!g.manager.clubId;
}

export function summarize(g: GameState): SaveSummary {
  const club = g.manager.clubId ? g.clubs[g.manager.clubId]?.name ?? '—' : 'Between jobs';
  return { manager: g.manager.name, club, season: g.season.year, matchweek: g.season.matchweek, saveVersion: g.saveVersion };
}

// ---------- compression (a career is ~2.5 MB of JSON, ~10x smaller gzipped) ----------

export async function encode(g: GameState): Promise<string> {
  const json = JSON.stringify(g);
  if (typeof CompressionStream === 'undefined') return json;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'gz:' + btoa(bin);
}

export async function decode(data: string): Promise<GameState> {
  if (!data.startsWith('gz:')) return JSON.parse(data) as GameState;
  const bin = atob(data.slice(3));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as GameState;
}

