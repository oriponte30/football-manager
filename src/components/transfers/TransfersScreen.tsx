import { useMemo, useState } from 'react';
import { Search, Binoculars } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, PosTag, ovrRead, paRead, Stars, staffStars, NationTag, valueKnown, valueRead, roughValue } from '../ui';
import { PlayerFace } from '../Face';
import { liveShortlist, currentBrief, briefOptionsFor, briefLevelFor, type BriefOption } from '../../engine/shortlistEngine';
import { COUNTRIES } from '../../data/countries';
import type { CountryCode } from '../../types/world';
import CRTMonitor from '../layout/CRTMonitor';
import YouthIntakeFolder from './YouthIntakeFolder';
import { marketList, windowWeeks } from '../../engine/transferEngine';
import { fmtMoney, spendable } from '../../engine/financeEngine';
import { fullName } from '../../engine/ratings';

type Tab = 'SHORTLIST' | 'TRANSFER' | 'FREE' | 'LOAN' | 'LOANED' | 'BIDS' | 'SCOUTING' | 'YOUTH';
const POS = ['ALL', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

export default function TransfersScreen() {
  const g = useGame();
  const club = useUserClub();
  const [tab, setTab] = useState<Tab>(g.pendingYouth.length ? 'YOUTH' : 'SHORTLIST');
  const tabs: [Tab, string][] = [['SHORTLIST', `Scout's shortlist (${liveShortlist(g).length})`], ['TRANSFER', 'Transfer market'], ['FREE', `Free agents (${g.freeAgentIds.length})`], ['LOAN', 'Loans'], ['LOANED', `Loaned out (${Object.values(g.players).filter((p) => p.loanFromClubId === club.id).length})`], ['BIDS', 'Faxed bids'], ['SCOUTING', `Scouting (${g.scouting.length})`], ['YOUTH', `Youth intake (${g.pendingYouth.length})`]];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {tabs.map(([t, l]) => <button key={t} className={`btn btn-sm ${tab === t ? 'btn-amber' : ''}`} onClick={() => setTab(t)}>{l}</button>)}
        <span className="ml-auto font-mono text-lg text-[#e8cf8f]">
          WINDOW: <span className={g.season.window === 'CLOSED' ? 'text-red-300' : 'text-green-300'}>{g.season.window}</span> <span className="opacity-80">({(() => { const w = windowWeeks(g.season.matchweek); return w.open ? `${w.weeks} week${w.weeks === 1 ? '' : 's'} left in window` : `${w.next === 'WINTER' ? 'winter' : 'summer'} window ${w.weeks > 0 ? `opens in ${w.weeks} wk` : 'next season'}`; })()})</span> · BANK {fmtMoney(club.finances.bank)} · SAFE BUDGET <span className={spendable(g, club) > 0 ? 'text-green-300' : 'text-red-300'}>{fmtMoney(Math.max(0, spendable(g, club)))}</span> · SCOUT <Stars value={staffStars(g, club, 'CHIEF_SCOUT')} size={12} />
        </span>
      </div>
      {tab === 'SHORTLIST' && <Shortlist />}
      {(tab === 'TRANSFER' || tab === 'FREE' || tab === 'LOAN') && <Market kind={tab} />}
      {tab === 'LOANED' && <LoanedOut />}
      {tab === 'BIDS' && <Bids />}
      {tab === 'SCOUTING' && <Scouting />}
      {tab === 'YOUTH' && <YouthIntakeFolder />}
    </div>
  );
}

function Market({ kind }: { kind: 'TRANSFER' | 'FREE' | 'LOAN' }) {
  const g = useGame();
  const club = useUserClub();
  const { openDossier, scout } = useGameStore();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const [maxAge, setMaxAge] = useState(40);
  const [maxVal, setMaxVal] = useState(() => [100000, 250000, 500000, 1000000, 3000000].find((v) => v >= club.finances.bank) ?? 0);
  const [scope, setScope] = useState<'ALL' | 'HOME' | 'ABROAD'>('ALL');
  const list = useMemo(() => marketList(g, club.id, kind, q, pos, maxAge), [g, club.id, kind, q, pos, maxAge]);
  const filtered = list.filter((m) => (maxVal ? (valueKnown(g, m.player, club.id) ? m.value : roughValue(m.player)) <= maxVal : true) && (scope === 'ALL' || !m.player.clubId || (scope === 'HOME' ? g.clubs[m.player.clubId].country === g.activeCountry : g.clubs[m.player.clubId].country !== g.activeCountry))).slice(0, 150);
  return (
    <CRTMonitor title={kind === 'TRANSFER' ? 'TRANSFER MARKET' : kind === 'FREE' ? 'FREE AGENTS — $0 FEE' : 'LOAN LIST — FRINGE & YOUNG PLAYERS'} page={kind === 'TRANSFER' ? '410' : kind === 'FREE' ? '411' : '412'}>
      <div className="flex flex-wrap gap-2 items-center mb-2 text-lg">
        <Search size={16} />
        <input className="bg-transparent border border-amber-crt/50 px-1 w-48 t-white" placeholder="name or club" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="bg-navy-900 border border-amber-crt/50" value={pos} onChange={(e) => setPos(e.target.value)}>{POS.map((p) => <option key={p}>{p}</option>)}</select>
        <label>MAX AGE <select className="bg-navy-900 border border-amber-crt/50" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}>{[19, 21, 23, 25, 28, 31, 40].map((a) => <option key={a} value={a}>{a === 40 ? 'ANY' : a}</option>)}</select></label>
        {kind !== 'FREE' && <label>MAX VALUE <select className="bg-navy-900 border border-amber-crt/50" value={maxVal} onChange={(e) => setMaxVal(Number(e.target.value))}>{[0, 100000, 250000, 500000, 1000000, 3000000].map((v) => <option key={v} value={v}>{v ? fmtMoney(v) : 'ANY'}</option>)}</select></label>}
        {kind !== 'FREE' && <div className="flex">{(['ALL', 'HOME', 'ABROAD'] as const).map((s) => <button key={s} className={`px-2 border border-amber-crt/50 ${scope === s ? 'bg-amber-crt text-navy-900' : ''}`} onClick={() => setScope(s)}>{s}</button>)}</div>}
      </div>
      <div className="grid grid-cols-[30px_34px_1fr_1fr_36px_70px_70px_80px_90px] t-dim text-base gap-x-1">
        <span /><span>POS</span><span>PLAYER</span><span>CLUB</span><span>AGE</span><span>OVR</span><span>POT</span><span>VALUE</span><span />
      </div>
      <div className="max-h-[560px] overflow-y-auto crt-scroll">
        {filtered.map((m) => {
          const p = m.player;
          const o = ovrRead(g, p, club.id);
          const pa = paRead(g, p, club);
          const scouting = g.scouting.some((s) => s.playerId === p.id);
          return (
            <div key={p.id} className="crt-row grid grid-cols-[30px_34px_1fr_1fr_36px_70px_70px_80px_90px] items-center gap-x-1 py-[1px]">
              <PlayerFace p={p} size={26} shirt={p.clubId ? g.clubs[p.clubId].colors[0] : '#555'} />
              <span><PosTag pos={p.position} /></span>
              <button className="text-left truncate t-white hover:underline" onClick={() => openDossier(p.id)}>{fullName(p)}</button>
              <span className="truncate t-dim">{m.clubName}{p.clubId && g.clubs[p.clubId].country !== g.activeCountry ? ` (${g.clubs[p.clubId].country})` : ''}</span>
              <span>{p.age}</span>
              <span className={g.scoutReports[p.id] ? 't-green' : ''}>{o.text}</span>
              <span>{pa.range ? `${pa.range[0]}–${pa.range[1]}` : '??'}</span>
              <span className={valueKnown(g, p, club.id) ? 't-green' : 't-dim'}>{valueKnown(g, p, club.id) ? fmtMoney(m.value) : '??'}</span>
              <span className="flex gap-1">
                <button disabled={scouting} title="Send scout" className="border border-amber-crt/50 px-1 disabled:opacity-40" onClick={() => scout(p.id)}><Binoculars size={14} /></button>
                <button className="border border-amber-crt/50 px-1" onClick={() => openDossier(p.id)}>{kind === 'FREE' ? 'SIGN' : 'BID'}</button>
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="t-dim">No players match.</div>}
      </div>
      <div className="t-dim text-base mt-2">GREEN = scouted (report on file). Unscouted ratings are rough press estimates, and values stay hidden until your scout has seen him.</div>
    </CRTMonitor>
  );
}

function Bids() {
  const g = useGame();
  const { openDossier, setFaxOpen } = useGameStore();
  const bids = [...g.bids].filter((b) => b.season === g.season.year).reverse();
  return (
    <div className="paper p-4">
      <div className="font-bold mb-2">FAXED BIDS THIS SEASON</div>
      {bids.length === 0 && <div className="text-sm opacity-70">No bids yet. Find a player in the market, scout him, then fax a bid from his dossier.</div>}
      <div className="space-y-1">
        {bids.map((b) => {
          const p = g.players[b.playerId];
          const other = b.direction === 'OUTGOING' ? (b.sellerClubId ? g.clubs[b.sellerClubId]?.name : '—') : g.clubs[b.buyerClubId]?.name;
          const color = b.status === 'ACCEPTED' || b.status === 'AGREED' || b.status === 'COMPLETED' ? 'stamp-green' : b.status === 'REJECTED' || b.status === 'COLLAPSED' ? 'stamp-red' : 'stamp-blue';
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-3 border-b border-black/10 py-1 text-sm">
              <span className="w-20 font-mono">{b.direction === 'OUTGOING' ? 'OUT →' : '← IN'}</span>
              <button className="underline w-48 text-left truncate" onClick={() => p && openDossier(p.id)}>{p ? fullName(p) : 'Unknown'}</button>
              <span className="w-48 truncate">{other}</span>
              <span className="w-32">{b.type === 'LOAN' ? `Loan ${Math.round(b.loanWageShare * 100)}%` : fmtMoney(b.counterFee ?? b.fee)}</span>
              <span className={`stamp ${color} text-xs`}>{b.status}</span>
              {(b.status === 'ACCEPTED' || b.status === 'COUNTERED' || (b.direction === 'INCOMING' && b.status === 'PENDING')) && <button className="btn btn-sm" onClick={() => setFaxOpen(true)}>OPEN FAX</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Scouting() {
  const g = useGame();
  const { openDossier } = useGameStore();
  const reports = Object.values(g.scoutReports).filter((r) => g.players[r.playerId]).sort((a, b) => b.season - a.season || b.week - a.week);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="paper p-4">
        <div className="font-bold">ACTIVE SCOUT ASSIGNMENTS</div>
        {g.scouting.length === 0 && <div className="text-sm opacity-70">None. Use the binoculars in the market.</div>}
        {g.scouting.map((s) => {
          const p = g.players[s.playerId];
          return <div key={s.id} className="text-sm">{p ? fullName(p) : '?'} — report due after MW {s.readyWeek}</div>;
        })}
      </div>
      <div className="paper p-4">
        <div className="font-bold">REPORTS ON FILE ({reports.length})</div>
        <div className="max-h-96 overflow-y-auto">
          {reports.map((r) => {
            const p = g.players[r.playerId];
            return (
              <button key={r.playerId} className="w-full text-left text-sm border-b border-black/10 py-1 hover:bg-yellow-100" onClick={() => openDossier(p.id)}>
                <PosTag pos={p.position} /> <b>{fullName(p)}</b> ({p.age}) — OVR {r.ovrRange[0]}–{r.ovrRange[1]}, POT {r.paRange[0]}–{r.paRange[1]} <span className="handwritten">{r.verdict}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The Chief Scout's standing list: refreshed every four weeks, better scouts find more (and better) names. */
function Shortlist() {
  const g = useGame();
  const club = useUserClub();
  const { openDossier, scout } = useGameStore();
  const list = liveShortlist(g);
  const stars = staffStars(g, club, 'CHIEF_SCOUT');
  const pending = (g.shortlist?.week ?? 0) < 0;
  const next = Math.max(0, 4 - (g.season.matchweek - (g.shortlist?.week ?? 0)));
  return (
    <div className="manila p-4 pt-6 mt-5">
      <div className="manila-tab">CHIEF SCOUT · SHORTLIST</div>
      <div className="flex flex-wrap justify-between items-baseline gap-2">
        <div className="font-type text-lg">Players we can realistically get, boss.</div>
        <div className="text-sm">Scout <Stars value={stars} size={12} /> · {list.length} names · {pending ? 'new brief: names after the next matchweek' : `new list in ${next || 'under a'} week${next === 1 ? '' : 's'}`}</div>
      </div>
      <ScoutBrief />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {list.map((p) => {
          const o = ovrRead(g, p, club.id);
          const pa = paRead(g, p, club);
          const owner = p.clubId ? g.clubs[p.clubId] : null;
          const scouting = g.scouting.some((x) => x.playerId === p.id);
          const note = g.shortlist?.notes?.[p.id];
          return (
            <div key={p.id} className="paper p-2 flex gap-2 items-start">
              <PlayerFace p={p} size={56} shirt={owner ? owner.colors[0] : '#666'} />
              <div className="min-w-0 flex-1 text-sm">
                <button className="font-bold truncate block text-left hover:underline w-full" onClick={() => openDossier(p.id)}>{fullName(p)}</button>
                <div className="flex items-center gap-1 flex-wrap"><PosTag pos={p.position} /> <NationTag code={p.nationality} /> <span>{p.age}</span></div>
                <div className="truncate opacity-80">{owner ? `${owner.name}${owner.country !== g.activeCountry ? ` (${owner.country})` : ''}` : 'Free agent'}</div>
                <div>OVR <b className={g.scoutReports[p.id] ? 'text-green-800' : ''}>{o.text}</b> · POT {pa.range ? `${pa.range[0]}–${pa.range[1]}` : '??'} · {valueRead(g, p, club.id)}</div>
                {note && <div className="handwritten leading-5">{note}</div>}
                <div className="flex gap-1 mt-1">
                  <button className="btn btn-sm" disabled={scouting || !!g.scoutReports[p.id]} onClick={() => scout(p.id)}>{scouting ? 'SCOUTING…' : g.scoutReports[p.id] ? 'SCOUTED' : 'SCOUT'}</button>
                  <button className="btn btn-sm btn-amber" onClick={() => openDossier(p.id)}>{owner ? 'BID' : 'OFFER'}</button>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="text-sm">The scout is still compiling names. Check back next week.</div>}
      </div>
      <div className="text-xs mt-2 opacity-70">A better Chief Scout brings more names, closer to what the squad needs, and spots hidden gems among the youngsters.</div>
    </div>
  );
}

/** Tell the scout what to look for and where. A better scout takes a more precise brief. */
function ScoutBrief() {
  const g = useGame();
  const club = useUserClub();
  const setBrief = useGameStore((s) => s.setScoutBrief);
  const stars = staffStars(g, club, 'CHIEF_SCOUT');
  const { focus, country } = currentBrief(g);
  const opts = briefOptionsFor(stars);
  const level = briefLevelFor(stars);
  const groups: [string, BriefOption[]][] = [
    ['Broad', opts.filter((o) => o.level === 'BROAD')],
    ['Bundles', opts.filter((o) => o.level === 'BUNDLE')],
    ['Exact position', opts.filter((o) => o.level === 'EXACT')],
  ];
  const countries: (CountryCode | 'ANY')[] = [g.activeCountry, ...(Object.keys(COUNTRIES) as CountryCode[]).filter((c) => c !== g.activeCountry), 'ANY'];
  return (
    <div className="paper p-3 mt-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">BRIEF</span>
        <span className="opacity-70">{level === 'BROAD' ? 'A 1–2★ scout only takes a broad brief.' : level === 'BUNDLE' ? 'A 2.5–3.5★ scout can hunt a group of positions.' : 'A 4★+ scout will find exactly the position you ask for.'}</span>
      </div>
      <div className="mt-2 space-y-1">
        {groups.filter(([, o]) => o.length > 0).map(([label, o]) => (
          <div key={label} className="flex flex-wrap items-center gap-1">
            <span className="w-28 text-xs uppercase opacity-60">{label}</span>
            {o.map((x) => <button key={x.id} className={`chip ${focus.id === x.id ? 'on' : ''}`} onClick={() => setBrief(x.id, country)}>{x.label}</button>)}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-28 text-xs uppercase opacity-60">Send him to</span>
          {countries.map((c) => (
            <button key={c} className={`chip ${country === c ? 'on' : ''}`} onClick={() => setBrief(focus.id, c)}>
              {c === 'ANY' ? 'All five countries' : `${COUNTRIES[c].name}${c === g.activeCountry ? ' (home)' : ''}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoanedOut() {
  const g = useGame();
  const club = useUserClub();
  const openDossier = useGameStore((s) => s.openDossier);
  const rows = Object.values(g.players).filter((p) => p.loanFromClubId === club.id);
  const left = Math.max(0, 31 - Math.max(1, g.season.matchweek));
  return (
    <CRTMonitor title="LOANED OUT: WHERE ARE THEY NOW" page="413">
      {rows.length === 0 && <div className="t-dim">Nobody is out on loan. Players aged 23 and under can be loaned from their dossier, or put on the loan list.</div>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base min-w-[700px]">
            <thead className="t-dim"><tr><th>POS</th><th>PLAYER</th><th>AGE</th><th>LOAN CLUB</th><th>LEFT</th><th>APPS</th><th>G</th><th>A</th><th>AVG</th><th>OVR</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const s = p.loanStart;
                const apps = p.season.apps - (s?.apps ?? 0);
                const rating = apps > 0 ? (p.season.ratingSum - (s?.ratingSum ?? 0)) / apps : 0;
                const delta = p.ca - (s?.ovr ?? p.ca);
                const dest = p.clubId ? g.clubs[p.clubId] : null;
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-white/10" onClick={() => openDossier(p.id)}>
                    <td><PosTag pos={p.position} /></td>
                    <td>{fullName(p)}</td>
                    <td>{p.age}</td>
                    <td>{dest ? `${dest.name} (T${dest.tier})` : '?'}</td>
                    <td>{left} wk</td>
                    <td>{apps}</td>
                    <td>{p.season.goals - (s?.goals ?? 0)}</td>
                    <td>{p.season.assists - (s?.assists ?? 0)}</td>
                    <td>{apps ? rating.toFixed(2) : '–'}</td>
                    <td className={delta > 0 ? 'text-green-300' : delta < 0 ? 'text-red-300' : ''}>{s?.ovr ?? p.ca} → {p.ca} ({delta > 0 ? '+' : ''}{delta})</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 t-dim text-base">They return in the summer. Growth depends only on minutes, ratings, age and the loan club's level: a kid on the bench does not improve.</div>
    </CRTMonitor>
  );
}
