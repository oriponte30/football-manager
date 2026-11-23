import { useEffect } from 'react';
import { Trophy, Users, ArrowLeftRight, Building2, Printer, Save, AlertTriangle, Newspaper } from 'lucide-react';
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

const TABS: { id: Screen; label: string; icon: typeof Trophy; key: string }[] = [
  { id: 'MATCHDAY', label: 'Matchday & Table', icon: Trophy, key: '1' },
  { id: 'TACTICS', label: 'Tactics & Squad', icon: Users, key: '2' },
  { id: 'TRANSFERS', label: 'Transfers & Scouting', icon: ArrowLeftRight, key: '3' },
  { id: 'CLUB', label: 'Club & Finances', icon: Building2, key: '4' },
  { id: 'NEWS', label: 'World News', icon: Newspaper, key: '5' },
];

export default function DeskShell() {
  const g = useGame();
  const club = useUserClub();
  const { screen, setScreen, faxOpen, setFaxOpen, dossierId, openDossier, toasts, saveError } = useGameStore();
  const unread = g.faxes.filter((f) => !f.read).length;
  const actionable = g.faxes.filter((f) => !f.resolved).length;
  const pos = leaguePosition(g, club.id);
  // "EXTRA!" when a big story broke this week
  const extra = g.news.some((n) => n.year === g.season.year && n.matchweek >= Math.min(30, g.season.matchweek - 1) && (n.weight >= 4 || n.myClub));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const t = TABS.find((x) => x.key === e.key);
      if (t) setScreen(t.id);
      if (e.key.toLowerCase() === 'f') setFaxOpen(!useGameStore.getState().faxOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setScreen, setFaxOpen]);

  return (
    <div className="min-h-full flex flex-col">
      {/* desk header strip */}
      <header className="px-4 pt-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 shadow-lg" style={{ background: club.colors[0], borderColor: club.colors[1] }} />
            <div className="text-paper">
              <div className="font-type text-2xl leading-6 text-[#f3ecd8] drop-shadow">{club.name}</div>
              <div className="font-mono text-lg text-[#e8cf8f] leading-5">
                {g.leagues[club.leagueId].name} · {g.leagues[club.leagueId].table[club.id]?.p ? ordinal(pos) : 'Pre-season'} · Season {g.season.year}/{String((g.season.year + 1) % 100).padStart(2, '0')} · {g.season.matchweek > 30 ? 'Season over' : `Matchweek ${g.season.matchweek}/30`}
                {g.season.window !== 'CLOSED' && <span className="ml-2 text-green-300">[{g.season.window} WINDOW OPEN]</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-lg">
            <Gauge label="BANK" value={fmtMoney(club.finances.bank)} warn={club.finances.bank < 0} />
            <Gauge label="BOARD" value={`${Math.round(club.board.value)}%`} warn={club.board.value < 30} />
            <Gauge label="FANS" value={`${Math.round(club.fanInterest)}%`} />
            <button className="btn btn-amber relative flex items-center gap-2" onClick={() => setFaxOpen(true)} title="Fax inbox (F)">
              <Printer size={18} /> FAX
              {unread > 0 && <span className="absolute -top-2 -right-2 bg-crimson text-white text-sm rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1 animate-pulse">{unread}</span>}
            </button>
            <span title={saveError ? 'Save failed (storage full?)' : 'Autosaved to this browser'} className={saveError ? 'text-red-400' : 'text-green-300'}>
              {saveError ? <AlertTriangle size={18} /> : <Save size={18} />}
            </span>
          </div>
        </div>
        <nav className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-tab flex items-center gap-2 whitespace-nowrap ${screen === t.id ? 'on' : ''}`} onClick={() => setScreen(t.id)}>
              <t.icon size={16} /> <span className="opacity-60">{t.key}</span> {t.label}
              {t.id === 'TRANSFERS' && g.pendingYouth.length > 0 && <span className="text-xs bg-crimson text-white rounded px-1">YOUTH</span>}
              {t.id === 'NEWS' && extra && <span className="text-xs bg-crimson text-white rounded px-1">EXTRA!</span>}
            </button>
          ))}
          {actionable > 0 && <span className="ml-auto self-center text-[#e8cf8f] font-mono text-lg">{actionable} fax{actionable > 1 ? 'es' : ''} need attention</span>}
        </nav>
      </header>
      <main className="flex-1 px-4 pb-6 border-t-4 border-navy-900">
        <div className="pt-4">
          {screen === 'MATCHDAY' && <MatchdayScreen />}
          {screen === 'TACTICS' && <TacticsScreen />}
          {screen === 'TRANSFERS' && <TransfersScreen />}
          {screen === 'CLUB' && <ClubFinancesScreen />}
          {screen === 'NEWS' && <NewsTab />}
        </div>
      </main>
      {g.status === 'SEASON_END' && g.seasonSummary && <SeasonSummaryModal />}
      {faxOpen && <FaxInboxModal />}
      {dossierId && g.players[dossierId] && <PlayerDossierModal playerId={dossierId} onClose={() => openDossier(null)} />}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className={`fax px-4 py-3 text-sm ${t.ok ? '' : 'border-l-4 border-crimson'}`} onClick={() => useGameStore.getState().dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Gauge({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`px-2 py-0 rounded border-2 ${warn ? 'border-red-500 bg-red-950 text-red-300' : 'border-[#8a6a46] bg-navy-900 text-amber-crt'} leading-5`}>
      <div className="text-xs opacity-70">{label}</div>
      <div>{value}</div>
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
