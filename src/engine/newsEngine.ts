/**
 * World News: auto-generated, dated back-page stories. Pure TS.
 * Stories are stored newest-first on g.news and capped at NEWS_CAP.
 */
import type { CountryCode, GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { NewsCategory, NewsItem } from '../types/news';
import type { InjuryRecord } from '../types/injury';
import { COUNTRIES } from '../data/countries';
import { nationOf } from '../data/nationalities';
import { fmtMoney } from './financeEngine';
import { fullName } from './ratings';
import { nextId } from './ids';
import type { Rng } from './rng';

export const NEWS_CAP = 20;
const NEWS_MAX_AGE = 10; // matchweeks

/** Drop stale stories: older than 10 matchweeks, and last season's, except its trophy wrap-up until matchweek 1. */
export function pruneNews(g: GameState): void {
  const mw = g.season.matchweek;
  g.news = g.news.filter((n) => (n.year === g.season.year ? mw - n.matchweek <= NEWS_MAX_AGE : n.year === g.season.year - 1 && n.category === 'TROPHY' && mw <= 1));
  if (g.news.length > NEWS_CAP) g.news.length = NEWS_CAP;
}

export interface NewsInput {
  category: NewsCategory;
  headline: string;
  body: string;
  clubIds: string[];
  country?: CountryCode;
  weight: number;
}

export function addNews(g: GameState, n: NewsInput): NewsItem {
  const userId = g.manager.clubId;
  const country = n.country ?? (n.clubIds[0] && g.clubs[n.clubIds[0]] ? g.clubs[n.clubIds[0]].country : g.activeCountry);
  const item: NewsItem = {
    id: nextId(g, 'n'),
    year: g.season.year,
    matchweek: Math.min(g.season.matchweek, 30),
    category: n.category,
    headline: n.headline,
    body: n.body,
    clubIds: n.clubIds,
    country,
    myClub: !!userId && n.clubIds.includes(userId),
    weight: n.weight,
  };
  g.news.unshift(item);
  pruneNews(g);
  return item;
}

/** True the first time `key` is seen this season (one-off stories). */
export function once(g: GameState, key: string): boolean {
  if (g.newsKeys[key] === g.season.year) return false;
  g.newsKeys[key] = g.season.year;
  return true;
}

/** Drop de-dupe keys from old seasons so the map never grows unbounded. */
export function pruneNewsKeys(g: GameState): void {
  for (const k of Object.keys(g.newsKeys)) if (!k.startsWith('debut:') && g.newsKeys[k] < g.season.year - 1) delete g.newsKeys[k];
}

const AFFIXES = new Set(['FC', 'AC', 'AS', 'US', 'SS', 'SV', 'SC', 'RC', 'CD', 'UD', 'SD', 'CF', 'AJ', 'ES', 'AFC', 'VfB', 'VfL', 'TSV', '1.', 'SpVgg',
  'United', 'Town', 'City', 'Rovers', 'Athletic', 'Wanderers', 'Albion', 'County', 'Rangers', 'Borough', 'Villa', 'Real', 'Club', 'Atlético', 'Atletico',
  'Deportivo', 'Racing', 'Unión', 'Unione', 'Sporting', 'Calcio', 'Virtus', 'Pro', 'Polisportiva', 'Borussia', 'Eintracht', 'Fortuna', 'Rot-Weiß',
  'Olympique', 'Stade', 'En', 'Avant', 'Girondins']);

/** Back-page name for a club: the town, as the tabloids would put it. */
export function paperName(club: Club): string {
  const words = club.name.split(' ').filter((w) => !AFFIXES.has(w));
  return words.length > 0 ? words.join(' ') : club.name;
}

const pickT = (rng: Rng | null, list: string[]) => (rng ? rng.pick(list) : list[0]);
const up = (s: string) => s.toUpperCase();

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

/** Blockbuster fee threshold depends on the buying league tier. */
export function blockbusterFee(tier: number): number {
  return tier === 1 ? 6_000_000 : tier === 2 ? 1_200_000 : 350_000;
}

export function newsTransfer(g: GameState, rng: Rng | null, p: Player, from: Club | null, to: Club, fee: number, kind: 'SIGNING' | 'CLAUSE' = 'SIGNING'): void {
  const userId = g.manager.clubId;
  const involvesUser = to.id === userId || from?.id === userId;
  const rec = g.transferRecord;
  const isRecord = fee > 0 && (!rec || fee > rec.fee);
  const blockbuster = fee >= blockbusterFee(to.tier);
  if (isRecord) g.transferRecord = { fee, playerName: fullName(p), year: g.season.year };
  if (!isRecord && !blockbuster && !involvesUser) return;
  const name = fullName(p);
  const nat = nationOf(p.nationality);
  const fromTxt = from ? from.name : 'free agency';
  let headline: string;
  if (isRecord && fee >= 1_000_000) {
    headline = pickT(rng, [`WORLD RECORD! ${up(paperName(to))} SMASH BANK FOR ${up(p.lastName)}`, `${fmtMoney(fee)}! ${up(p.lastName)} BREAKS THE RECORD`, `RECORD-BREAKER: ${up(to.name)} LAND ${up(p.lastName)}`]);
  } else if (kind === 'CLAUSE') {
    headline = pickT(rng, [`POACHED! ${up(to.name)} TRIGGER ${up(p.lastName)} CLAUSE`, `CLAUSE BOMBSHELL: ${up(p.lastName)} GONE`]);
  } else if (blockbuster) {
    headline = pickT(rng, [`BLOCKBUSTER! ${up(p.lastName)} JOINS ${up(to.name)}`, `${up(paperName(to))} SPLASH ${fmtMoney(fee)} ON ${up(p.lastName)}`, `MEGA-MOVE: ${up(p.lastName)} SEALED`]);
  } else {
    headline = to.id === userId ? `${up(paperName(to))} SNAP UP ${up(p.lastName)}` : `${up(p.lastName)} LEAVES ${up(from ? paperName(from) : '')}`;
  }
  const body = `${name} (${nat.flag} ${nat.name}, ${p.age}, ${p.position}) moves from ${fromTxt} to ${to.name}${fee > 0 ? ` for ${fmtMoney(fee)}` : ''}.`
    + (isRecord && fee >= 1_000_000 ? ' No player has ever cost more.' : '')
    + (to.country !== (from?.country ?? to.country) ? ` A cross-border deal: ${COUNTRIES[from!.country].name} to ${COUNTRIES[to.country].name}.` : '');
  addNews(g, {
    category: 'TRANSFER', headline, body, clubIds: from ? [to.id, from.id] : [to.id], country: to.country,
    weight: isRecord && fee >= 1_000_000 ? 5 : blockbuster ? 4 : 2,
  });
}

/* ------------------------------------------------------------------ */
/* Trophies & cup shocks                                               */
/* ------------------------------------------------------------------ */

export function newsLeagueChampion(g: GameState, rng: Rng | null, club: Club, leagueName: string, points: number): void {
  const headline = club.tier === 1
    ? pickT(rng, [`${up(club.name)} ARE CHAMPIONS!`, `TITLE GLORY FOR ${up(club.name)}`, `${up(paperName(club))} CROWNED KINGS OF ${up(COUNTRIES[club.country].name)}`])
    : pickT(rng, [`${up(club.name)} WIN ${up(leagueName)}`, `PROMOTION PARTY AT ${up(club.name)}`]);
  addNews(g, {
    category: 'TROPHY', headline,
    body: `${club.name} finish top of ${leagueName} with ${points} points.`,
    clubIds: [club.id], country: club.country, weight: club.tier === 1 ? 5 : 3,
  });
}

export function newsCupWinner(g: GameState, rng: Rng | null, club: Club, cupName: string, runnerUp: Club | null): void {
  addNews(g, {
    category: 'TROPHY',
    headline: pickT(rng, [`${up(paperName(club))} LIFT THE ${up(cupName)}`, `CUP GLORY FOR ${up(club.name)}`, `${up(cupName)}: ${up(club.name)} TRIUMPH`]),
    body: `${club.name} win the ${cupName}${runnerUp ? `, beating ${runnerUp.name} in the final` : ''}.${club.tier > 1 ? ` A fairytale for a Tier ${club.tier} side!` : ''}`,
    clubIds: runnerUp ? [club.id, runnerUp.id] : [club.id], country: club.country, weight: club.tier > 1 ? 5 : 4,
  });
}

export function newsEuroWinner(g: GameState, rng: Rng | null, club: Club, runnerUp: Club | null): void {
  addNews(g, {
    category: 'TROPHY',
    headline: pickT(rng, [`${up(club.name)}: KINGS OF EUROPE`, `EUROPEAN CUP IS ${up(paperName(club))}'S!`, `CONTINENTAL CROWN FOR ${up(club.name)}`]),
    body: `${club.name} (${COUNTRIES[club.country].name}) are European champions${runnerUp ? ` after beating ${runnerUp.name}` : ''}.`,
    clubIds: runnerUp ? [club.id, runnerUp.id] : [club.id], country: club.country, weight: 5,
  });
}

export function newsGiantKilling(g: GameState, rng: Rng | null, winner: Club, loser: Club, score: string, cupName: string): void {
  const gap = winner.tier - loser.tier;
  addNews(g, {
    category: 'GIANT_KILLING',
    headline: gap >= 2
      ? pickT(rng, [`GIANT-KILLING! ${up(winner.name)} STUN ${up(loser.name)}`, `CUP SHOCK OF THE CENTURY`, `MINNOWS ${up(paperName(winner))} SINK ${up(paperName(loser))}`])
      : `${up(paperName(winner))} UPSET ${up(paperName(loser))}`,
    body: `Tier ${winner.tier} ${winner.name} knock Tier ${loser.tier} ${loser.name} out of the ${cupName}, ${score}.`,
    clubIds: [winner.id, loser.id], country: winner.country, weight: gap >= 2 ? 4 : 2,
  });
}

/* ------------------------------------------------------------------ */
/* User-club stories                                                   */
/* ------------------------------------------------------------------ */

export function newsPurplePatch(g: GameState, rng: Rng | null, p: Player, club: Club): void {
  if (!once(g, `patch:${p.id}:${g.season.matchweek}`)) return;
  addNews(g, {
    category: 'FORM',
    headline: pickT(rng, [`${up(p.lastName)} IS ON FIRE!`, `PURPLE PATCH FOR ${up(p.lastName)}`, `UNSTOPPABLE ${up(p.lastName)}`]),
    body: `${fullName(p)} is in the form of his life for ${club.name}${p.season.goals > 0 ? ` — ${p.season.goals} goal${p.season.goals > 1 ? 's' : ''} this season` : ''}.`,
    clubIds: [club.id], weight: 2,
  });
}

export function newsInjury(g: GameState, rng: Rng | null, p: Player, club: Club, inj: InjuryRecord, key: boolean): void {
  const serious = inj.severity === 'SERIOUS' || inj.severity === 'SEVERE';
  const mine = club.id === g.manager.clubId;
  // back page only cares about serious injuries, or a key man at the user's club
  if (!serious && !(mine && key && inj.severity === 'MODERATE')) return;
  if (!mine && !(inj.severity === 'SEVERE' && p.ca >= 78) && !(serious && p.ca >= 85)) return;
  const headline = inj.severity === 'SEVERE'
    ? pickT(rng, [`SEASON OVER FOR ${up(p.lastName)}`, `${up(p.lastName)} NIGHTMARE: ${up(inj.name)}`, `HEARTBREAK FOR ${up(paperName(club))}`])
    : serious
      ? pickT(rng, [`${up(paperName(club))} BLOW: ${up(p.lastName)} OUT`, `${up(p.lastName)} SIDELINED FOR WEEKS`, `INJURY CRISIS AT ${up(paperName(club))}`])
      : `${up(p.lastName)} FACES SPELL ON SIDELINES`;
  addNews(g, {
    category: 'INJURY', headline,
    body: `${fullName(p)} suffered ${/^[aeiou]/i.test(inj.name) ? 'an' : 'a'} ${inj.name.toLowerCase()} ${inj.source === 'TRAINING' ? 'in training' : 'during the match'} and is expected to miss ${inj.weeksTotal} week${inj.weeksTotal > 1 ? 's' : ''}.`,
    clubIds: [club.id], weight: inj.severity === 'SEVERE' ? 4 : serious ? 3 : 2,
  });
}

export function newsWonderkidDebut(g: GameState, rng: Rng | null, p: Player, club: Club): void {
  if (!once(g, `debut:${p.id}`)) return;
  addNews(g, {
    category: 'YOUTH',
    headline: pickT(rng, [`STAR IS BORN: ${up(p.lastName)} (${p.age}) DEBUTS`, `WONDERKID ${up(p.lastName)} BOWS IN`, `${up(paperName(club))}'S GOLDEN TICKET`]),
    body: `${p.age}-year-old ${fullName(p)} made his senior debut for ${club.name}. The academy staff have been whispering about this one for years.`,
    clubIds: [club.id], weight: 4,
  });
}

export function newsCircling(g: GameState, rng: Rng | null, p: Player, club: Club, suitors: Club[]): void {
  if (suitors.length === 0 || !once(g, `circling:${p.id}`)) return;
  const names = suitors.slice(0, 2).map((c) => c.name).join(' and ');
  addNews(g, {
    category: 'RUMOUR',
    headline: pickT(rng, [`VULTURES CIRCLE ${up(p.lastName)}`, `${up(paperName(suitors[0]))} EYE ${up(paperName(club))} STARLET`, `HANDS OFF OUR ${up(p.lastName)}!`]),
    body: `Scouts from ${names} have been spotted watching ${p.age}-year-old ${fullName(p)}, whose breakout season has not gone unnoticed.`,
    clubIds: [club.id, ...suitors.slice(0, 2).map((c) => c.id)], weight: 3,
  });
}

export function newsManager(g: GameState, club: Club, kind: 'HIRED' | 'SACKED'): void {
  addNews(g, {
    category: 'MANAGER',
    headline: kind === 'HIRED' ? `${up(g.manager.name)} TAKES THE HOT SEAT` : `${up(paperName(club))} SACK ${up(g.manager.name)}`,
    body: kind === 'HIRED' ? `${g.manager.name} is the new manager of ${club.name}.` : `${club.name} have parted company with ${g.manager.name}.`,
    clubIds: [club.id], weight: kind === 'SACKED' ? 4 : 3,
  });
}

export function newsClub(g: GameState, club: Club, headline: string, body: string, weight = 1): void {
  addNews(g, { category: 'CLUB', headline, body, clubIds: [club.id], weight });
}

/* ------------------------------------------------------------------ */
/* Weekly scan for user-club breakout youngsters                       */
/* ------------------------------------------------------------------ */

export function scanBreakouts(g: GameState, rng: Rng): void {
  const userId = g.manager.clubId;
  if (!userId) return;
  const club = g.clubs[userId];
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (!p || p.age > 21 || p.season.apps < 5) continue;
    const avg = p.season.ratingSum / p.season.apps;
    if (avg < 7.0 && p.season.goals < 6) continue;
    if (!rng.chance(0.25)) continue;
    const suitors = Object.values(g.clubs)
      .filter((c) => c.id !== userId && c.reputation > club.reputation + 10 && (c.tier < club.tier || c.country !== club.country || c.tier === 1))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 8);
    newsCircling(g, rng, p, club, rng.shuffle(suitors).slice(0, 2));
  }
}
