import { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, Modal, PosTag, NationTag, ovrRead, paRead } from '../ui';
import { PlayerFace } from '../Face';
import { valuePlayer } from '../../engine/transferEngine';
import type { FaxMessage } from '../../types/transfers';
import { fmtMoney } from '../../engine/financeEngine';

const KIND_LABEL: Record<FaxMessage['kind'], string> = {
  SCOUT_REPORT: 'SCOUT', BID_RESPONSE: 'BID', INCOMING_BID: 'OFFER', LOAN_RESPONSE: 'LOAN', TRADE_PROPOSAL: 'SWAP', JOB_OFFER: 'JOB',
  TERMINATION: 'BOARD', DILEMMA: 'DILEMMA', YOUTH_INTAKE: 'YOUTH', BOARD: 'BOARD', NEWS: 'NEWS', CONTRACT: 'CONTRACT',
};

/** Incoming faxes: scout reports, bids, dilemmas, job and sacking faxes. */
export default function FaxInboxModal() {
  const g = useGame();
  const s = useGameStore();
  const [selId, setSelId] = useState<string | null>(() => {
    const focus = s.faxFocusId && g.faxes.find((f) => f.id === s.faxFocusId);
    return focus ? focus.id : g.faxes.find((f) => !f.resolved)?.id ?? g.faxes[0]?.id ?? null;
  });
  const sel = g.faxes.find((f) => f.id === selId) ?? null;
  useEffect(() => {
    if (sel && !sel.read) s.markFaxRead(sel.id);
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (f: FaxMessage) => {
    setSelId(f.id);
    if (!f.read) s.markFaxRead(f.id);
  };
  return (
    <Modal onClose={() => s.setFaxOpen(false)} wide>
      <div className="bg-[#2b2b2b] rounded-lg p-3 shadow-2xl border-4 border-[#555]">
        <div className="flex justify-between items-center text-[#e8cf8f] font-mono text-xl mb-2">
          <span className="flex items-center gap-2"><Printer size={18} /> FAX MACHINE — {g.faxes.length} on the spike</span>
          <button className="btn btn-sm" onClick={() => s.setFaxOpen(false)}><X size={16} /></button>
        </div>
        <div className="grid md:grid-cols-[300px_1fr] gap-3">
          <div className="max-h-[70vh] overflow-y-auto bg-[#1d1d1d] rounded p-1">
            {g.faxes.length === 0 && <div className="text-[#aaa] p-2 font-mono">No faxes yet.</div>}
            {g.faxes.map((f) => (
              <button key={f.id} onClick={() => open(f)} className={`w-full text-left px-2 py-1 mb-1 rounded font-mono text-sm ${selId === f.id ? 'bg-[#faf8f0] text-black' : 'bg-[#3a3a3a] text-[#ddd]'} ${!f.read ? 'border-l-4 border-amber-crt' : ''}`}>
                <div className="flex justify-between text-[11px] opacity-70"><span>{KIND_LABEL[f.kind]}{!f.resolved ? ' · ACTION' : ''}</span><span>MW{f.week} {f.season}</span></div>
                <div className="truncate">{f.title}</div>
              </button>
            ))}
          </div>
          <div>{sel ? <FaxSheet key={sel.id} f={sel} /> : <div className="text-[#aaa] font-mono">Select a fax.</div>}</div>
        </div>
      </div>
    </Modal>
  );
}

function ContractTerms({ wage, setWage, years, setYears }: { wage: number; setWage: (v: number) => void; years: number; setYears: (v: number) => void }) {
  return (
    <div className="w-full flex flex-wrap items-center gap-2 text-sm font-mono border border-dashed border-black/40 p-2">
      <span className="font-bold">PERSONAL TERMS:</span>
      <label>Wage $<input type="number" className="desk-input w-24 ml-1" step={50} value={wage} onChange={(e) => setWage(Number(e.target.value))} />/wk</label>
      <select className="desk-input" value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} yr</option>)}</select>
      <span className="opacity-70">checked against club reputation, wage and length</span>
    </div>
  );
}

function FaxSheet({ f }: { f: FaxMessage }) {
  const g = useGame();
  const s = useGameStore();
  const bid = f.bidId ? g.bids.find((b) => b.id === f.bidId) : undefined;
  const report = f.kind === 'SCOUT_REPORT' && f.playerId ? g.scoutReports[f.playerId] : undefined;
  const clarity = report ? report.clarity : 1;
  const close = () => s.setFaxOpen(false);
  const [wage, setWage] = useState(bid?.wage ?? 0);
  const [years, setYears] = useState(bid?.years ?? 3);
  return (
    <div className={`fax p-6 ${clarity < 0.35 ? 'fax-messy' : clarity > 0.7 ? 'fax-crisp' : ''}`}>
      <div className="flex justify-between text-xs border-b border-dashed border-black/40 pb-1">
        <span>FROM: {f.from.toUpperCase()}</span><span>MATCHWEEK {f.week} · {f.season}</span>
      </div>
      <div className="text-2xl font-bold mt-3">{f.title}</div>
      <div className="mt-2 whitespace-pre-wrap font-mono text-[15px]">
        {f.body.split('\n').map((l, i) => <div key={i} className="fax-line">{l}</div>)}
      </div>
      <InvolvedPlayers f={f} />
      {report && (
        <div className="mt-3 font-mono text-sm grid grid-cols-2 gap-x-6">
          {Object.entries(report.statRanges).map(([k, r]) => (
            <div key={k} className="fax-line flex justify-between"><span className="uppercase">{k}</span><span>{r![0]}–{r![1]}{r![1] - r![0] > 12 ? '?' : ''}</span></div>
          ))}
          <div className="fax-line col-span-2 mt-1">TRAITS: {report.revealedTraits.join(', ') || '—'}{report.hiddenTraitCount > 0 ? ` (+${report.hiddenTraitCount} unknown)` : ''}</div>
          <div className="col-span-2 mt-2"><span className={`stamp ${report.staffStars >= 4 ? 'stamp-green' : report.staffStars >= 2.5 ? 'stamp-blue' : 'stamp-red'}`}>{report.staffStars >= 4 ? 'VERIFIED' : report.staffStars >= 2.5 ? 'PROBABLE' : 'UNCERTAIN'}</span></div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {!f.resolved && f.kind === 'BID_RESPONSE' && (bid?.status === 'ACCEPTED' || bid?.status === 'COUNTERED') && (
          <ContractTerms key={bid.id} wage={wage} setWage={setWage} years={years} setYears={setYears} />
        )}
        {!f.resolved && f.kind === 'BID_RESPONSE' && bid?.status === 'ACCEPTED' && <button className="btn btn-green" onClick={() => s.finalizeBid(bid.id, false, wage, years)}>SIGN THE CONTRACT ✍</button>}
        {!f.resolved && f.kind === 'BID_RESPONSE' && bid?.status === 'COUNTERED' && <>
          <button className="btn btn-green" onClick={() => s.finalizeBid(bid.id, true, wage, years)}>ACCEPT COUNTER & SIGN</button>
          <button className="btn btn-red" onClick={() => s.resolveFax(f.id)}>WALK AWAY</button>
        </>}
        {!f.resolved && f.kind === 'LOAN_RESPONSE' && bid?.status === 'ACCEPTED' && <button className="btn btn-green" onClick={() => s.finalizeBid(bid.id, false)}>CONFIRM LOAN</button>}
        {!f.resolved && f.kind === 'INCOMING_BID' && bid && bid.status === 'PENDING' && <>
          <button className="btn btn-green" onClick={() => s.answerIncoming(bid.id, true)}>ACCEPT {fmtMoney(bid.fee)}</button>
          <CounterAsk key={`${bid.id}-${bid.fee}`} fee={bid.fee} onAsk={(v) => s.counterIncoming(bid.id, v)} />
          <button className="btn btn-red" onClick={() => s.answerIncoming(bid.id, false)}>REJECT</button>
        </>}
        {!f.resolved && f.kind === 'TRADE_PROPOSAL' && <>
          <button className="btn btn-green" onClick={() => s.answerTrade(f.id, true)}>ACCEPT SWAP</button>
          <button className="btn btn-red" onClick={() => s.answerTrade(f.id, false)}>DECLINE</button>
        </>}
        {!f.resolved && f.kind === 'JOB_OFFER' && f.jobOfferId && g.jobOffers.some((o) => o.id === f.jobOfferId) && <>
          <button className="btn btn-green" onClick={() => { s.acceptJob(f.jobOfferId!); close(); }}>ACCEPT THE JOB</button>
          <button className="btn btn-red" onClick={() => s.declineJob(f.jobOfferId!)}>DECLINE</button>
        </>}
        {!f.resolved && f.kind === 'DILEMMA' && g.dilemma && g.dilemma.options.map((o, i) => (
          <button key={i} className="btn btn-amber text-left" onClick={() => s.resolveDilemma(i)} title={o.description}>
            {o.label}<span className="block text-sm opacity-80">{o.description}</span>
          </button>
        ))}
        {!f.resolved && f.kind === 'YOUTH_INTAKE' && <button className="btn btn-green" onClick={() => { s.setScreen('TRANSFERS'); close(); }}>OPEN YOUTH FOLDER</button>}
        {!f.resolved && (f.kind === 'BID_RESPONSE' || f.kind === 'LOAN_RESPONSE') && bid && bid.status !== 'ACCEPTED' && bid.status !== 'COUNTERED' && <button className="btn btn-sm" onClick={() => s.resolveFax(f.id)}>FILE IT</button>}
      </div>
    </div>
  );
}

function CounterAsk({ fee, onAsk }: { fee: number; onAsk: (v: number) => void }) {
  const [ask, setAsk] = useState(Math.round((fee * 1.3) / 5000) * 5000);
  return (
    <span className="inline-flex items-center gap-1 border border-black/30 px-2">
      <span className="text-sm">ASK $</span>
      <input type="number" className="desk-input w-28" step={5000} value={ask} onChange={(e) => setAsk(Number(e.target.value))} />
      <button className="btn btn-amber btn-sm" onClick={() => onAsk(ask)}>COUNTER</button>
    </span>
  );
}

/** Every player a fax is about, as a clickable card: tap the name for the full dossier. */
function InvolvedPlayers({ f }: { f: FaxMessage }) {
  const g = useGame();
  const club = useUserClub();
  const openDossier = useGameStore((s) => s.openDossier);
  const ids: { id: string; label: string }[] = [];
  if (f.trade) {
    ids.push({ id: f.trade.requestedPlayerId, label: 'YOU GIVE' });
    ids.push({ id: f.trade.offeredPlayerId, label: 'YOU GET' });
  } else if (f.playerId) ids.push({ id: f.playerId, label: f.kind === 'INCOMING_BID' ? 'THEY WANT' : f.kind === 'SCOUT_REPORT' ? 'REPORT ON' : 'PLAYER' });
  const rows = ids.filter((x) => g.players[x.id]);
  if (rows.length === 0) return null;
  return (
    <div className={`mt-3 grid gap-2 ${rows.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {rows.map(({ id, label }) => {
        const p = g.players[id];
        const owner = p.clubId ? g.clubs[p.clubId] : null;
        const o = ovrRead(g, p, club.id);
        const pa = paRead(g, p, club);
        return (
          <button key={id} className="flex gap-2 items-center text-left border border-black/30 rounded p-2 bg-white/60 hover:bg-yellow-50" onClick={() => openDossier(id)} title="Open his full dossier">
            <PlayerFace p={p} size={48} shirt={owner ? owner.colors[0] : '#666'} />
            <span className="min-w-0 text-sm font-mono">
              <span className="block text-[11px] opacity-60">{label}</span>
              <span className="block font-bold underline truncate">{p.firstName} {p.lastName}</span>
              <span className="flex items-center gap-1 flex-wrap"><PosTag pos={p.position} /> <NationTag code={p.nationality} /> {p.age} yrs · {owner?.shortName ?? 'Free'}</span>
              <span className="block">OVR {o.text} · POT {pa.range ? `${pa.range[0]}–${pa.range[1]}` : '??'} · {fmtMoney(valuePlayer(p))}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
