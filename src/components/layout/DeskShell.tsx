import { useEffect, useRef, useState } from 'react';
import { withLiveTables } from '../../engine/liveTable';
import { CloudButton } from '../account/CloudLayer';
import { Trophy, Users, ArrowLeftRight, Building2, Save, AlertTriangle, Newspaper, X } from 'lucide-react';
import { useGameStore, type Screen } from '../../store/useGameStore';
import { useGame, useUserClub, Modal, ordinal } from '../ui';
import { fmtMoney } from '../../engine/financeEngine';
import { leaguePosition } from '../../engine/seasonLoop';
import MatchdayScreen from '../matchday/MatchdayScreen';
import TacticsScreen from '../tactics/TacticsScreen';
import TransfersScreen from '../transfers/TransfersScreen';
import ClubFinancesScreen from '../club/ClubFinancesScreen';
import NewsTab from '../news/NewsTab';
import FaxInboxModal from '../club/FaxInboxModal';
import PlayerDossierModal from '../tactics/PlayerDossierModal';
import CRTMonitor from './CRTMonitor';
import { matchDate } from '../news/NewsTab';

const TABS: { id: Screen; label: string; icon: typeof Trophy; key: string }[] = [
  { id: 'MATCHDAY', label: 'Matchday & Table', icon: Trophy, key: '1' },
  { id: 'TACTICS', label: 'Tactics & Squad', icon: Users, key: '2' },
  { id: 'TRANSFERS', label: 'Transfers & Scouting', icon: ArrowLeftRight, key: '3' },
  { id: 'CLUB', label: 'Club & Finances', icon: Building2, key: '4' },
];

export default function DeskShell() {
  const g = useGame();
  const club = useUserClub();
  const { screen, setScreen, faxOpen, setFaxOpen, dossierId, openDossier, toasts, saveError, simming, newsOpen, setNewsOpen } = useGameStore();
  const unread = g.faxes.filter((f) => !f.read).length;
  const actionable = g.faxes.filter((f) => !f.resolved).length;
  const liveScore = useGameStore((st) => st.liveScore);
  const pos = leaguePosition(withLiveTables(g, liveScore), club.id);
  const [ringing, setRinging] = useState(false);
  const [dilemmaLater, setDilemmaLater] = useState<string | null>(null);
  const quietPhase = g.phase === 'MATCHDAY' || simming;
  const showDilemma = !!g.dilemma && !quietPhase && !faxOpen && dilemmaLater !== g.dilemma.id;

  // urgent paperwork: the fax machine rings, prints, and lands on your desk
  const urgentKey = g.urgentFaxIds.join(',');
  const ringTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!urgentKey || quietPhase || faxOpen || showDilemma) return;
    const first = g.urgentFaxIds.find((id) => g.faxes.some((f) => f.id === id && !f.resolved));
    if (!first) { useGameStore.getState().clearUrgentFaxes(); return; }
    setRinging(true);
    ringTimer.current = window.setTimeout(() => {
      setRinging(false);
      useGameStore.getState().openFax(first);
      useGameStore.getState().clearUrgentFaxes();
    }, 1100);
    return () => { if (ringTimer.current) window.clearTimeout(ringTimer.current); setRinging(false); };
  }, [urgentKey, quietPhase, faxOpen, showDilemma]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const t = TABS.find((x) => x.key === e.key);
      if (t) setScreen(t.id);
      if (e.key === '5' || e.key.toLowerCase() === 'n') setNewsOpen(!useGameStore.getState().newsOpen);
      if (e.key.toLowerCase() === 'f') setFaxOpen(!useGameStore.getState().faxOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setScreen, setFaxOpen, setNewsOpen]);

  const date = matchDate(g.season.year, Math.min(30, g.season.matchweek));
  return (
    <div className="min-h-full flex flex-col desk">
      <div className="lamp-glow" aria-hidden />
      <header className="px-4 pt-3 relative z-[1]">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div className="flex items-end gap-4">
            <DeskCalendar date={date} />
            <div className="nameplate">
              <span className="crest" style={{ background: club.colors[0], borderColor: club.colors[1] }} />
              <div>
                <div className="nameplate-club">{club.name}</div>
                <div className="nameplate-sub">
                  {g.manager.name} · {g.leagues[club.leagueId].name} · {g.leagues[club.leagueId].table[club.id]?.p ? ordinal(pos) : 'Pre-season'} · {g.season.matchweek > 30 ? 'Season over' : g.season.matchweek < 1 ? `Pre-season ${g.season.matchweek + 3}/3` : `MW ${g.season.matchweek}/30`}
                  {g.season.window !== 'CLOSED' && <span className="ml-2 window-open">{g.season.window} WINDOW OPEN</span>}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-3 font-mono text-lg">
            <Gauge label="BANK" value={fmtMoney(club.finances.bank)} warn={club.finances.bank < 0} />
            <Gauge label="BOARD" value={`${Math.round(club.board.value)}%`} warn={club.board.value < 30} />
            <Gauge label="FANS" value={`${Math.round(club.fanInterest)}%`} />
            <button className={`fax-machine ${ringing ? 'ringing' : ''} ${unread > 0 ? 'has-mail' : ''}`} onClick={() => setFaxOpen(true)} title="Fax machine (F)">
              <span className="fax-paper" />
              <span className="fax-body"><span className="fax-led" /><span className="fax-label">FAX</span></span>
              {unread > 0 && <span className="fax-count">{unread}</span>}
            </button>
            <span title={saveError ? 'Save failed (storage full?)' : 'Autosaved to this browser'} className={`pb-2 ${saveError ? 'text-red-400' : 'text-green-300'}`}>
              {saveError ? <AlertTriangle size={18} /> : <Save size={18} />}
            </span>
            <CloudButton compact />
          </div>
        </div>
        <nav className="flex gap-1 mt-3 overflow-x-auto items-end">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-tab flex items-center gap-2 whitespace-nowrap ${screen === t.id ? 'on' : ''}`} onClick={() => setScreen(t.id)}>
              <t.icon size={16} /> {t.label}
              {t.id === 'TRANSFERS' && g.pendingYouth.length > 0 && <span className="text-xs bg-crimson text-white rounded px-1">YOUTH</span>}
              {t.id === 'MATCHDAY' && g.phase === 'MATCHDAY' && <span className="text-xs bg-crimson text-white rounded px-1 animate-pulse">LIVE</span>}
            </button>
          ))}
          {actionable > 0 && <button className="ml-auto self-center text-[#e8cf8f] font-mono text-lg hover:underline" onClick={() => setFaxOpen(true)}>{actionable} fax{actionable > 1 ? 'es' : ''} need attention</button>}
        </nav>
      </header>
      <main className="flex-1 px-4 pb-6 blotter relative z-[1]">
        <NewsCrawl />
        <div className="pt-4 page-in" key={screen}>
          {screen === 'MATCHDAY' && <MatchdayScreen />}
          {screen === 'TACTICS' && <TacticsScreen />}
          {screen === 'TRANSFERS' && <TransfersScreen />}
          {screen === 'CLUB' && <ClubFinancesScreen />}
          {screen === 'NEWS' && <NewsTab />}
        </div>
      </main>
      {g.status === 'SEASON_END' && g.seasonSummary && g.phase !== 'MATCHDAY' && <SeasonSummaryModal />}
      {showDilemma && <DilemmaModal onLater={() => setDilemmaLater(g.dilemma!.id)} />}
      {newsOpen && (
        <Modal onClose={() => setNewsOpen(false)} wide>
          <div className="relative paper-drop">
            <button className="absolute -right-3 -top-4 z-10 btn btn-sm" onClick={() => setNewsOpen(false)}><X size={16} /></button>
            <NewsTab />
          </div>
        </Modal>
      )}
      {faxOpen && <FaxInboxModal />}
      {dossierId && g.players[dossierId] && <PlayerDossierModal playerId={dossierId} onClose={() => openDossier(null)} />}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className={`fax px-4 py-3 text-sm toast-in ${t.ok ? '' : 'border-l-4 border-crimson'}`} onClick={() => useGameStore.getState().dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeskCalendar({ date }: { date: Date }) {
  return (
    <div className="desk-calendar" title="Matchday">
      <div className="cal-month">{date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</div>
      <div className="cal-day">{date.getUTCDate()}</div>
      <div className="cal-year">{date.getUTCFullYear()}</div>
    </div>
  );
}

/** A vidiprinter crawl of the week's headlines; click it to unfold the paper. */
function NewsCrawl() {
  const g = useGame();
  const setNewsOpen = useGameStore((s) => s.setNewsOpen);
  const items = g.news.slice(0, 12);
  if (items.length === 0) return null;
  const extra = g.news.some((n) => n.year === g.season.year && n.matchweek >= Math.min(30, g.season.matchweek - 1) && (n.weight >= 4 || n.myClub));
  const dur = Math.max(28, items.reduce((a, n) => a + n.headline.length, 0) / 7);
  return (
    <button className="news-crawl" onClick={() => setNewsOpen(true)} title="Open the paper (N)">
      <span className="crawl-label"><Newspaper size={15} /> {extra ? 'EXTRA!' : 'NEWS'}</span>
      <span className="crawl-window">
        <span className="crawl-track" style={{ animationDuration: `${dur}s` }} key={items[0].id}>
          {[0, 1].map((k) => (
            <span key={k} aria-hidden={k === 1}>
              {items.map((n) => <span key={n.id} className={`crawl-item ${n.myClub ? 'mine' : ''}`}>{n.headline}</span>)}
            </span>
          ))}
        </span>
      </span>
      <span className="crawl-open">READ ▸</span>
    </button>
  );
}

function DilemmaModal({ onLater }: { onLater: () => void }) {
  const g = useGame();
  const resolve = useGameStore((s) => s.resolveDilemma);
  const d = g.dilemma!;
  return (
    <Modal onClose={onLater}>
      <div className="manila p-5 pt-6 mt-8 paper-drop">
        <div className="manila-tab">DRESSING ROOM · URGENT</div>
        <div className="font-type text-2xl">{d.title}</div>
        <div className="mt-2 text-lg leading-6">{d.text}</div>
        <div className="mt-4 flex flex-col gap-2">
          {d.options.map((o, i) => (
            <button key={i} className="choice-card text-left" onClick={() => resolve(i)}>
              <div className="font-bold">{o.label}</div>
              <div className="text-sm">{o.description}</div>
            </button>
          ))}
        </div>
        <button className="text-sm underline mt-3 opacity-70" onClick={onLater}>Leave it on the fax for now</button>
      </div>
    </Modal>
  );
}

function Gauge({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`gauge ${warn ? 'warn' : ''}`}>
      <div className="g-label">{label}</div>
      <div className="text-xl">{value}</div>
    </div>
  );
}

function SeasonSummaryModal() {
  const g = useGame();
  const s = g.seasonSummary!;
  const nextSeason = useGameStore((st) => st.nextSeason);
  const setFaxOpen = useGameStore((st) => st.setFaxOpen);
  const offers = g.jobOffers.length;
  return (
    <Modal onClose={() => undefined}>
      <CRTMonitor title={`END OF SEASON ${s.year}/${String((s.year + 1) % 100).padStart(2, '0')}`} page="888">
        <div className="space-y-1 crt-scroll max-h-[60vh] overflow-y-auto">
          <div className="t-green text-2xl">{s.boardVerdict}</div>
          {s.incomeTV > 0 && <div className="t-cyan">TV & sponsor money received: {fmtMoney(s.incomeTV)}</div>}
          {s.lines.map((l, i) => <div key={i} className={i === 0 ? 't-white text-xl' : ''}>{l}</div>)}
        </div>
        <div className="mt-4 flex gap-3 flex-wrap">
          <button className="btn btn-green text-2xl" onClick={nextSeason}>START SEASON {s.year + 1}/{String((s.year + 2) % 100).padStart(2, '0')} ▶</button>
          {offers > 0 && <button className="btn btn-amber" onClick={() => setFaxOpen(true)}>{offers} JOB OFFER{offers > 1 ? 'S' : ''} ON THE FAX</button>}
        </div>
      </CRTMonitor>
    </Modal>
  );
}
