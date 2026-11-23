import { useMemo, useState } from 'react';
import type { CountryCode } from '../../types/world';
import type { NewsCategory, NewsItem } from '../../types/news';
import { useGame } from '../ui';
import { COUNTRIES } from '../../data/countries';

/** Localised mastheads for the five nations' back pages. */
const MASTHEAD: Record<CountryCode, { title: string; motto: string; price: string; city: string }> = {
  ENG: { title: 'The Sunday Pitch', motto: 'All the football news that’s fit to print', price: '40p', city: 'London' },
  ESP: { title: 'El Balón Diario', motto: 'El diario deportivo de toda España', price: '125 ptas', city: 'Madrid' },
  ITA: { title: 'La Gazzetta del Campo', motto: 'Il quotidiano del calcio italiano', price: 'L. 1.500', city: 'Milano' },
  GER: { title: 'Der Anstoß', motto: 'Die Fußballzeitung der Republik', price: '1,50 DM', city: 'Frankfurt' },
  FRA: { title: 'Le Quotidien Foot', motto: 'Le journal du football français', price: '6 F', city: 'Paris' },
};

const MONTHS: Record<CountryCode, string[]> = {
  ENG: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ESP: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ITA: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  GER: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  FRA: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};
const SATURDAY: Record<CountryCode, string> = { ENG: 'Saturday', ESP: 'Sábado', ITA: 'Sabato', GER: 'Samstag', FRA: 'Samedi' };
const MATCHWEEK_WORD: Record<CountryCode, string> = { ENG: 'Matchweek', ESP: 'Jornada', ITA: 'Giornata', GER: 'Spieltag', FRA: 'Journée' };
const SEASON_WORD: Record<CountryCode, string> = { ENG: 'Season', ESP: 'Temporada', ITA: 'Stagione', GER: 'Saison', FRA: 'Saison' };

const KICKER: Record<NewsCategory, string> = {
  TRANSFER: 'Transfer Market', TROPHY: 'Silverware', GIANT_KILLING: 'Cup Shock', INJURY: 'Treatment Room',
  FORM: 'In Form', YOUTH: 'Academy', RUMOUR: 'Rumour Mill', MANAGER: 'The Dugout', CLUB: 'Club News',
};

/** Matchday date: the season kicks off on the second Saturday of August, ends in May. */
export function matchDate(year: number, matchweek: number): Date {
  const d = new Date(Date.UTC(year, 7, 8));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  // 30 matchweeks spread mid-August → mid-May (cup & European weeks in between)
  d.setUTCDate(d.getUTCDate() + Math.round((Math.max(1, Math.min(30, matchweek)) - 1) * 9.3));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function dateLine(country: CountryCode, year: number, mw: number): string {
  const d = matchDate(year, mw);
  const m = MONTHS[country][d.getUTCMonth()];
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  if (country === 'ENG') return `${SATURDAY.ENG}, ${day} ${m} ${y}`;
  if (country === 'GER') return `${SATURDAY.GER}, ${day}. ${m} ${y}`;
  if (country === 'ESP') return `${SATURDAY.ESP}, ${day} de ${m} de ${y}`;
  return `${SATURDAY[country]} ${day} ${m} ${y}`;
}

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;

export default function NewsTab() {
  const g = useGame();
  const [filter, setFilter] = useState<'ALL' | 'MINE'>('ALL');
  const country = g.activeCountry;
  const mh = MASTHEAD[country];
  const mw = Math.min(30, g.season.matchweek);
  const issueNo = (g.season.year - 1994) * 30 + mw;

  const items = useMemo(() => (filter === 'MINE' ? g.news.filter((n) => n.myClub) : g.news), [g.news, filter]);
  const lead = useMemo(() => pickLead(items), [items]);
  const rest = items.filter((n) => n !== lead);

  return (
    <div className="broadsheet px-6 py-5 rotate-[-0.25deg]">
      {/* masthead */}
      <div className="flex items-end justify-between text-xs condensed">
        <span>No. {issueNo} · {mh.city}</span>
        <span className="hidden sm:inline italic normal-case" style={{ fontFamily: "'Old Standard TT', serif" }}>“{mh.motto}”</span>
        <span>Price {mh.price}</span>
      </div>
      <h1 className="masthead text-center text-6xl md:text-7xl mt-1">{mh.title}</h1>
      <div className="rule-double mt-2" />
      <div className="flex flex-wrap items-center justify-between gap-2 py-1 condensed text-sm">
        <span>{SEASON_WORD[country]} {seasonLabel(g.season.year)} · {MATCHWEEK_WORD[country]} {mw}{g.season.matchweek > 30 ? ' (final edition)' : ''}</span>
        <span>{dateLine(country, g.season.year, mw)}</span>
        <div className="paper-toggle flex">
          <button className={filter === 'ALL' ? 'on' : ''} onClick={() => setFilter('ALL')}>Full Paper</button>
          <button className={filter === 'MINE' ? 'on' : ''} onClick={() => setFilter('MINE')}>My Club</button>
        </div>
      </div>
      <div className="rule-thick" />

      {!lead && (
        <div className="py-16 text-center">
          <div className="lead-headline text-4xl">{filter === 'MINE' ? 'NO NEWS IS GOOD NEWS' : 'THE PRESSES ARE WARMING UP'}</div>
          <p className="mt-3 italic">{filter === 'MINE' ? 'Our reporters have nothing on your club yet. Win something.' : 'The new season’s first stories will appear after the opening matchweek.'}</p>
        </div>
      )}

      {lead && (
        <article className="py-4 relative">
          <div className="condensed text-sm tracking-widest text-center">{KICKER[lead.category]} · {COUNTRIES[lead.country].name} · {MATCHWEEK_WORD[country]} {lead.matchweek}, {seasonLabel(lead.year)}</div>
          <h2 className="lead-headline text-center text-4xl md:text-6xl mt-2">{lead.headline}</h2>
          {lead.myClub && <div className="absolute right-2 top-2"><span className="myclub-stamp big">MY CLUB</span></div>}
          <div className="rule-thin mt-3 mx-auto w-2/3" />
          <p className="dropcap text-lg leading-7 mt-3 max-w-3xl mx-auto">{lead.body}</p>
        </article>
      )}

      {rest.length > 0 && (
        <>
          <div className="rule-double" />
          <div className="news-cols mt-3">
            {rest.map((n) => <Brief key={n.id} n={n} country={country} />)}
          </div>
        </>
      )}
      <div className="rule-thin mt-4" />
      <div className="text-[11px] condensed text-center pt-1 opacity-70">Printed and published by the desk of {g.manager.name} · Archive keeps the last 60 stories</div>
    </div>
  );
}

function Brief({ n, country }: { n: NewsItem; country: CountryCode }) {
  return (
    <div className="brief">
      <div className="flex items-start justify-between gap-2">
        <div className="condensed text-[11px] tracking-widest opacity-75">
          {KICKER[n.category]} · {COUNTRIES[n.country].flag} {n.country} · {MATCHWEEK_WORD[country].slice(0, 3)}. {n.matchweek} · {seasonLabel(n.year)}
        </div>
        {n.myClub && <span className="myclub-stamp shrink-0">MY CLUB</span>}
      </div>
      <h3 className={`condensed font-bold leading-tight mt-1 ${n.weight >= 4 ? 'text-2xl' : n.weight >= 3 ? 'text-xl' : 'text-lg'}`}>{n.headline}</h3>
      <p className="text-[15px] leading-5 mt-1">{n.body}</p>
    </div>
  );
}

/** Lead story: the heaviest story from the latest week that has news. */
function pickLead(items: NewsItem[]): NewsItem | null {
  if (items.length === 0) return null;
  const top = items[0];
  const recent = items.filter((n) => n.year === top.year && n.matchweek >= top.matchweek - 1);
  return recent.reduce((best, n) => (n.weight > best.weight ? n : best), recent[0]);
}
