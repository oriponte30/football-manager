/**
 * Procedural player portraits: tiny deterministic SVGs (no images, ~12 nodes)
 * seeded by the player and shaped by his nationality, so faces differ from
 * one another but stay culturally plausible. Memoised: a squad list of 30
 * costs well under a millisecond to re-render.
 */
import { memo } from 'react';
import type { Player } from '../types/player';

const SKIN = ['#f5d6c1', '#ebc2a3', '#dcab86', '#c58d65', '#a36d48', '#7f4f33', '#5c3621', '#412517'];
const HAIR = { black: '#17110e', dark: '#33221a', brown: '#5a3a24', light: '#8b5d36', blonde: '#c8a35e', platinum: '#e2d1a0', ginger: '#9d4b27', grey: '#9a9590' };
type HairColor = keyof typeof HAIR;
type HairStyle = 'buzz' | 'short' | 'side' | 'curly' | 'afro' | 'long' | 'mullet' | 'bald' | 'flattop' | 'spiky';
type Beard = 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard';

interface Profile {
  skin: number[]; // weights over SKIN
  hair: Partial<Record<HairColor, number>>;
  styles: Partial<Record<HairStyle, number>>;
  beard: Partial<Record<Beard, number>>;
  monolid?: boolean;
}

const NORTH_HAIR = { blonde: 3, light: 3, brown: 3, dark: 2, ginger: 0.6 };
const SOUTH_HAIR = { black: 4, dark: 4, brown: 1.5, light: 0.3 };
const MIXED_SKIN = [3, 4, 2.5, 1.5, 1, 1.2, 1.2, 0.6];
const EURO_STYLES = { short: 4, side: 3, buzz: 2, mullet: 1.5, spiky: 1, long: 0.8, curly: 0.8, bald: 0.4, flattop: 0.3 };
const AFRICAN_STYLES = { buzz: 4, short: 2.5, afro: 1.5, flattop: 1.2, bald: 1, curly: 1.2 };
const LATIN_STYLES = { short: 3, side: 2, curly: 2, long: 1.6, mullet: 1.2, buzz: 1.5, spiky: 0.6 };
const BEARDS_EU = { none: 6, stubble: 2.5, moustache: 0.8, goatee: 0.6, beard: 0.8 };

const P = (skin: number[], hair: Profile['hair'], styles: Profile['styles'], beard: Profile['beard'] = BEARDS_EU, monolid = false): Profile => ({ skin, hair, styles, beard, monolid });

const PROFILES: Record<string, Profile> = {
  ENG: P(MIXED_SKIN, { ...NORTH_HAIR, black: 1.5 }, EURO_STYLES),
  FRA: P([2, 3, 2.5, 2, 1.2, 1.5, 1.8, 1], { dark: 3, brown: 2.5, black: 3, light: 1, blonde: 0.6 }, { ...EURO_STYLES, buzz: 3 }),
  NED: P(MIXED_SKIN, { ...NORTH_HAIR, blonde: 4, black: 1 }, EURO_STYLES),
  BEL: P([3, 4, 2, 1.5, 1, 1, 1.2, 0.6], { ...NORTH_HAIR, black: 1.2 }, EURO_STYLES),
  GER: P([5, 4, 1.5, 0.6, 0.3, 0.4, 0.4, 0.2], NORTH_HAIR, EURO_STYLES),
  AUT: P([5, 4, 1.5, 0.5, 0.2, 0, 0, 0], NORTH_HAIR, EURO_STYLES),
  POL: P([6, 4, 1, 0.2, 0, 0, 0, 0], { ...NORTH_HAIR, blonde: 3.5 }, { ...EURO_STYLES, buzz: 3 }),
  SWE: P([7, 3, 0.8, 0.3, 0.2, 0.2, 0.3, 0], { blonde: 6, platinum: 2.5, light: 3, brown: 1.5, ginger: 0.5 }, { ...EURO_STYLES, long: 1.6 }),
  DEN: P([7, 3, 0.8, 0.3, 0.2, 0.2, 0.2, 0], { blonde: 5, platinum: 2, light: 3, brown: 2, ginger: 0.6 }, EURO_STYLES),
  SCO: P([8, 3, 0.5, 0.2, 0, 0, 0, 0], { ginger: 3, light: 3, brown: 3, blonde: 1.5, dark: 1.5 }, EURO_STYLES),
  IRL: P([8, 3, 0.5, 0.2, 0, 0, 0, 0], { ginger: 2.5, brown: 3.5, dark: 3, light: 2, blonde: 1 }, EURO_STYLES),
  ESP: P([1, 4, 4, 2, 0.4, 0, 0, 0], SOUTH_HAIR, { ...EURO_STYLES, long: 1.5, curly: 1.2 }),
  ITA: P([1, 4, 4, 2, 0.3, 0, 0, 0], SOUTH_HAIR, { ...EURO_STYLES, side: 4, long: 1.4 }),
  POR: P([1, 3, 4, 2.5, 0.8, 0.5, 0.5, 0.2], SOUTH_HAIR, { ...EURO_STYLES, spiky: 1.6 }),
  CRO: P([3, 5, 2, 0.5, 0, 0, 0, 0], { dark: 4, brown: 4, black: 2, light: 1.5, blonde: 0.6 }, { ...EURO_STYLES, buzz: 3 }),
  SRB: P([3, 5, 2, 0.6, 0, 0, 0, 0], { dark: 5, black: 3, brown: 3, light: 0.8 }, { ...EURO_STYLES, buzz: 3.5 }),
  USA: P(MIXED_SKIN, { ...NORTH_HAIR, black: 2 }, { ...EURO_STYLES, buzz: 3 }),
  BRA: P([0.6, 1.5, 2.5, 3, 2.5, 2, 1.5, 1], { black: 6, dark: 3, brown: 1 }, { ...LATIN_STYLES, buzz: 2.5, curly: 2.5, bald: 0.6 }),
  COL: P([0.4, 1.2, 2.5, 3, 2.5, 1.5, 1, 0.6], { black: 6, dark: 3 }, LATIN_STYLES),
  ARG: P([1.5, 4, 3.5, 1.5, 0.4, 0, 0, 0], { dark: 4, black: 4, brown: 2, light: 0.4 }, { ...LATIN_STYLES, long: 2.5 }),
  URU: P([1.5, 4, 3.5, 1.5, 0.5, 0.2, 0.2, 0], { dark: 4, black: 4, brown: 2 }, LATIN_STYLES),
  MEX: P([0.2, 1.5, 3.5, 4, 2, 0.5, 0, 0], { black: 6, dark: 3 }, LATIN_STYLES, { none: 5, stubble: 2, moustache: 2, goatee: 1, beard: 0.5 }),
  JPN: P([2, 5, 2.5, 0.5, 0, 0, 0, 0], { black: 8, dark: 2 }, { short: 4, side: 3, spiky: 2, long: 1, buzz: 1 }, { none: 9, stubble: 0.5, goatee: 0.3 }, true),
  KOR: P([2.5, 5, 2, 0.4, 0, 0, 0, 0], { black: 8, dark: 2 }, { short: 4, side: 3.5, spiky: 1.2, buzz: 1 }, { none: 9, stubble: 0.5 }, true),
  NGA: P([0, 0, 0, 0, 0.5, 2, 4, 4], { black: 10 }, AFRICAN_STYLES, { none: 6, stubble: 2, goatee: 1, beard: 1 }),
  GHA: P([0, 0, 0, 0, 0.5, 2, 4, 4], { black: 10 }, AFRICAN_STYLES, { none: 6, stubble: 2, goatee: 1, beard: 1 }),
  CMR: P([0, 0, 0, 0, 0.5, 2, 4, 4], { black: 10 }, AFRICAN_STYLES, { none: 6, stubble: 2, goatee: 1, beard: 1 }),
  SEN: P([0, 0, 0, 0, 0.2, 1.5, 3.5, 5], { black: 10 }, AFRICAN_STYLES, { none: 6, stubble: 2, goatee: 1, beard: 1 }),
  MAR: P([0.5, 2, 4, 3.5, 1.5, 0.3, 0, 0], { black: 6, dark: 4 }, { short: 3, curly: 3, buzz: 2.5, side: 1, spiky: 1 }, { none: 5, stubble: 3, beard: 1.5, goatee: 1, moustache: 0.5 }),
};
const DEFAULT = PROFILES.ENG;

/** tiny deterministic hash → [0,1) stream */
function stream(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function pickW<T extends string>(r: number, w: Partial<Record<T, number>>): T {
  const entries = Object.entries(w) as [T, number][];
  const tot = entries.reduce((a, [, v]) => a + v, 0);
  let x = r * tot;
  for (const [k, v] of entries) { x -= v; if (x <= 0) return k; }
  return entries[entries.length - 1][0];
}
function pickIdx(r: number, w: number[]): number {
  const tot = w.reduce((a, b) => a + b, 0);
  let x = r * tot;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return w.length - 1;
}
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

interface Props { seed: number; nation: string; age?: number; size?: number; shirt?: string; className?: string }

function FaceSvg({ seed, nation, age = 25, size = 40, shirt = '#3b4a6b', className = '' }: Props) {
  const prof = PROFILES[nation] ?? DEFAULT;
  const r = stream(seed * 2654435761);
  const skin = SKIN[pickIdx(r(), prof.skin)];
  let hairC: HairColor = pickW(r(), prof.hair);
  if (age >= 33 && r() < 0.35) hairC = 'grey';
  let style: HairStyle = pickW(r(), prof.styles);
  if (age >= 31 && r() < 0.18) style = 'bald';
  const beard: Beard = age < 20 ? 'none' : pickW(r(), prof.beard);
  const hair = HAIR[hairC];
  const w = 14 + r() * 3; // head half-width
  const jaw = 0.85 + r() * 0.25;
  const eyeY = 31 + r() * 2;
  const eyeGap = 5.5 + r() * 1.5;
  const brow = r() < 0.5 ? 0.8 : 1.4;
  const smile = r() * 2.4 - 0.6;
  const noseW = 1.6 + r() * 1.6;
  const dark = shade(skin, 0.82);
  const cx = 32;
  const top = 12;
  const chin = 50;
  const head = `M${cx - w} ${eyeY - 2} Q${cx - w} ${top} ${cx} ${top} Q${cx + w} ${top} ${cx + w} ${eyeY - 2} Q${cx + w} ${chin - 8 * jaw} ${cx} ${chin} Q${cx - w} ${chin - 8 * jaw} ${cx - w} ${eyeY - 2}Z`;
  const ey = prof.monolid ? 0.9 : 1.5;
  const back: JSX.Element[] = [];
  const front: JSX.Element[] = [];
  switch (style) {
    case 'afro':
      back.push(<ellipse key="a" cx={cx} cy={22} rx={w + 6} ry={15} fill={hair} />);
      break;
    case 'long':
      back.push(<path key="l" d={`M${cx - w - 2} 22 Q${cx - w - 4} 46 ${cx - w + 2} 50 L${cx + w - 2} 50 Q${cx + w + 4} 46 ${cx + w + 2} 22Z`} fill={hair} />);
      front.push(<path key="lt" d={`M${cx - w - 1} 30 Q${cx - w - 2} 8 ${cx} 9 Q${cx + w + 2} 8 ${cx + w + 1} 30 Q${cx + w - 2} 18 ${cx + 2} 17 Q${cx - w + 3} 17 ${cx - w - 1} 30Z`} fill={hair} />);
      break;
    case 'mullet':
      back.push(<path key="m" d={`M${cx - w} 30 L${cx - w + 1} 49 L${cx + w - 1} 49 L${cx + w} 30Z`} fill={hair} />);
      break;
    default:
  }
  switch (style) {
    case 'buzz':
      front.push(<path key="b" d={`M${cx - w} ${eyeY - 3} Q${cx - w} ${top - 1} ${cx} ${top - 1} Q${cx + w} ${top - 1} ${cx + w} ${eyeY - 3} Q${cx + w - 2} 19 ${cx} 18.5 Q${cx - w + 2} 19 ${cx - w} ${eyeY - 3}Z`} fill={hair} opacity={0.75} />);
      break;
    case 'short':
    case 'mullet':
      front.push(<path key="s" d={`M${cx - w - 1} ${eyeY - 2} Q${cx - w - 2} ${top - 3} ${cx} ${top - 3} Q${cx + w + 2} ${top - 3} ${cx + w + 1} ${eyeY - 2} Q${cx + w - 1} 20 ${cx + 7} 19 Q${cx} 22 ${cx - 7} 19 Q${cx - w + 1} 20 ${cx - w - 1} ${eyeY - 2}Z`} fill={hair} />);
      break;
    case 'side':
      front.push(<path key="sd" d={`M${cx - w - 1} ${eyeY - 1} Q${cx - w - 3} ${top - 4} ${cx + 2} ${top - 3} Q${cx + w + 2} ${top - 2} ${cx + w + 1} ${eyeY - 2} Q${cx + w} 18 ${cx + 6} 17 Q${cx - 6} 22 ${cx - w + 2} 23 Q${cx - w} 25 ${cx - w - 1} ${eyeY - 1}Z`} fill={hair} />);
      break;
    case 'spiky':
      front.push(<path key="sp" d={`M${cx - w - 1} ${eyeY - 3} L${cx - w + 1} ${top - 2} L${cx - 7} ${top + 1} L${cx - 4} ${top - 5} L${cx} ${top} L${cx + 4} ${top - 5} L${cx + 7} ${top + 1} L${cx + w - 1} ${top - 2} L${cx + w + 1} ${eyeY - 3} Q${cx} 18 ${cx - w - 1} ${eyeY - 3}Z`} fill={hair} />);
      break;
    case 'curly':
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.05 + (i / 5) * 0.9);
        front.push(<circle key={`c${i}`} cx={cx + Math.cos(a) * (w - 1)} cy={22 + Math.sin(a) * 11} r={5.2} fill={hair} />);
      }
      break;
    case 'afro':
      front.push(<path key="at" d={`M${cx - w - 3} 26 Q${cx} 14 ${cx + w + 3} 26 L${cx + w + 3} 18 Q${cx} 4 ${cx - w - 3} 18Z`} fill={hair} />);
      break;
    case 'flattop':
      front.push(<path key="f" d={`M${cx - w} ${eyeY - 4} L${cx - w + 2} ${top - 2} Q${cx} ${top - 4} ${cx + w - 2} ${top - 2} L${cx + w} ${eyeY - 4} Q${cx} 19 ${cx - w} ${eyeY - 4}Z`} fill={hair} opacity={0.92} />);
      break;
    case 'bald':
      front.push(<path key="bd" d={`M${cx - w} ${eyeY} Q${cx - w} ${eyeY - 8} ${cx - w + 3} ${eyeY - 10} L${cx - w + 2} ${eyeY}Z M${cx + w} ${eyeY} Q${cx + w} ${eyeY - 8} ${cx + w - 3} ${eyeY - 10} L${cx + w - 2} ${eyeY}Z`} fill={hair} opacity={0.7} />);
      front.push(<ellipse key="sh" cx={cx - 4} cy={top + 4} rx={4} ry={2} fill="#fff" opacity={0.18} />);
      break;
    default:
  }
  const beardEl: JSX.Element[] = [];
  const jawPath = `M${cx - w + 1} ${eyeY + 4} Q${cx - w + 2} ${chin - 6 * jaw} ${cx} ${chin} Q${cx + w - 2} ${chin - 6 * jaw} ${cx + w - 1} ${eyeY + 4} Q${cx + w - 4} ${eyeY + 13} ${cx} ${eyeY + 12} Q${cx - w + 4} ${eyeY + 13} ${cx - w + 1} ${eyeY + 4}Z`;
  if (beard === 'stubble') beardEl.push(<path key="st" d={jawPath} fill={hair} opacity={0.22} />);
  if (beard === 'beard') beardEl.push(<path key="bb" d={jawPath} fill={hair} opacity={0.85} />);
  if (beard === 'moustache' || beard === 'goatee' || beard === 'beard') beardEl.push(<path key="mo" d={`M${cx - 5} ${eyeY + 10} Q${cx} ${eyeY + 7.5} ${cx + 5} ${eyeY + 10} Q${cx} ${eyeY + 9} ${cx - 5} ${eyeY + 10}Z`} fill={hair} stroke={hair} strokeWidth={1.4} />);
  if (beard === 'goatee') beardEl.push(<ellipse key="gt" cx={cx} cy={chin - 2.5} rx={3.2} ry={3} fill={hair} opacity={0.9} />);

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`face ${className}`} aria-hidden>
      <rect x="0" y="0" width="64" height="64" rx="6" fill="#d9d2c0" />
      <path d="M6 64 Q8 52 22 50 L42 50 Q56 52 58 64Z" fill={shirt} />
      <path d="M26 50 L32 56 L38 50Z" fill={shade(shirt, 0.7)} />
      {back}
      <rect x={cx - 5} y={44} width={10} height={8} fill={dark} />
      <ellipse cx={cx - w} cy={eyeY + 1} rx={2.4} ry={3.4} fill={dark} />
      <ellipse cx={cx + w} cy={eyeY + 1} rx={2.4} ry={3.4} fill={dark} />
      <path d={head} fill={skin} />
      {beardEl}
      {front}
      <rect x={cx - eyeGap - 3} y={eyeY - 4} width={6} height={brow} rx={0.5} fill={hair === HAIR.platinum ? HAIR.light : hair} opacity={0.9} />
      <rect x={cx + eyeGap - 3} y={eyeY - 4} width={6} height={brow} rx={0.5} fill={hair === HAIR.platinum ? HAIR.light : hair} opacity={0.9} />
      <ellipse cx={cx - eyeGap} cy={eyeY} rx={1.6} ry={ey} fill="#1a1410" />
      <ellipse cx={cx + eyeGap} cy={eyeY} rx={1.6} ry={ey} fill="#1a1410" />
      <path d={`M${cx} ${eyeY + 1} L${cx - noseW / 2} ${eyeY + 6} L${cx + noseW / 2} ${eyeY + 6.4}`} fill="none" stroke={shade(skin, 0.7)} strokeWidth={1} strokeLinecap="round" />
      <path d={`M${cx - 4} ${eyeY + 11} Q${cx} ${eyeY + 11 + smile} ${cx + 4} ${eyeY + 11}`} fill="none" stroke={shade(skin, 0.55)} strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}

export const Face = memo(FaceSvg);

export function PlayerFace({ p, size = 40, shirt, className }: { p: Player; size?: number; shirt?: string; className?: string }) {
  return <Face seed={p.paSeed} nation={p.nationality} age={p.age} size={size} shirt={shirt} className={className} />;
}
