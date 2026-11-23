import { useCloud } from '../../cloud/sync';
import { useMemo, useState } from 'react';
import { Printer, Shuffle, RotateCcw } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { CountryCode, GameState } from '../../types/world';
import { COUNTRY_CODES } from '../../types/world';
import { COUNTRIES } from '../../data/countries';
import { ARCHETYPES } from '../../data/archetypes';
import { squadStrength } from '../../engine/lineup';
import { fmtMoney, weeklyWageBill } from '../../engine/financeEngine';
import { starsFromInternal } from '../../engine/ratings';
import CRTMonitor from '../layout/CRTMonitor';
import { Stars, FlagIcon } from '../ui';

/** Country selector → 3 faxed job offers (+ tucked-away Free Pick). Also the post-sacking desk. */
export default function JobOfferDesk() {
  const game = useGameStore((s) => s.game);
  if (!game) return <CountryPicker />;
  return <OffersDesk g={game} />;
}

function CountryPicker() {
  const newWorld = useGameStore((s) => s.newWorld);
  const [name, setName] = useState('');
  const [country, setCountry] = useState<CountryCode>('ENG');
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-start">
        <CRTMonitor title="RETRO DESK FC" page="100" className="md:row-span-2">
          <div className="space-y-2">
            <div className="t-green text-3xl">THE 1990s MANAGER'S DESK</div>
            <div className="t-white">A football management simulation.</div>
            <div className="t-dim">----------------------------------------</div>
            <div>1 TURN = 1 MATCHWEEK. 30 WEEKS A SEASON.</div>
            <div>START IN THE THIRD TIER. CLIMB THE LADDER.</div>
            <div>WIN THE CUP. CONQUER EUROPE. DON'T GET SACKED.</div>
            <div className="t-dim">----------------------------------------</div>
            <div className="t-cyan">KEYS: 1-4 SWITCH SCREENS, F = FAX INBOX</div>
            <div className="blink t-green">▮</div>
          </div>
        </CRTMonitor>
        <div className="paper p-6 rotate-[0.6deg]">
          <div className="flex justify-between items-start">
            <div className="text-xs uppercase tracking-widest opacity-60">Application for Management</div>
            <button className="btn btn-sm !h-auto py-1" onClick={() => useCloud.getState().setAccountOpen(true)}>LOG IN / SIGN UP</button>
          </div>
          <div className="text-xs opacity-70 mt-1">Already playing on another device? Log in to load your career.</div>
          <label className="block mt-3">
            <span className="text-sm">Manager's name</span>
            <input className="desk-input w-full mt-1" value={name} maxLength={28} placeholder="e.g. Ron Atkins" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="mt-4 text-sm">Country of employment</div>
          <div className="grid grid-cols-1 gap-2 mt-1">
            {COUNTRY_CODES.map((c) => {
              const d = COUNTRIES[c];
              return (
                <button key={c} onClick={() => setCountry(c)} className={`text-left border-2 rounded px-3 py-1 ${country === c ? 'border-navy-900 bg-navy-900 text-amber-crt' : 'border-[#6e6550] bg-[#fffbe9]'}`}>
                  <span className="text-lg mr-2"><FlagIcon code={d.code} emoji={d.flag} /></span><b>{d.name}</b>
                  <span className="block text-xs opacity-80">{flavour(c)}</span>
                </button>
              );
            })}
          </div>
          <button className="btn btn-green w-full mt-5 text-2xl flex items-center justify-center gap-2" onClick={() => newWorld(name.trim() || 'The Gaffer', country)}>
            <Printer size={20} /> REQUEST JOB OFFERS
          </button>
        </div>
      </div>
    </div>
  );
}

function flavour(c: CountryCode): string {
  switch (c) {
    case 'ENG': return 'Huge TV money, wage inflation. Regens lean Physical & Pace.';
    case 'ESP': return 'Strict wage caps. Regens lean Passing & Dribbling.';
    case 'ITA': return 'Tactical & defensive. Regens lean Defending & Goalkeeping.';
    case 'GER': return 'Cheaper facility upgrades. Regens lean Stamina/Physical.';
    case 'FRA': return 'Lowest TV money, premium fees from abroad. Regens lean Pace & Dribbling.';
  }
}

function OffersDesk({ g }: { g: GameState }) {
  const { acceptJob, freePick, resetCareer, playMatchweek, nextSeason } = useGameStore();
  const [free, setFree] = useState(false);
  const sacked = g.status === 'SACKED';
  const termination = g.faxes.find((f) => f.kind === 'TERMINATION' && !f.resolved);
  return (
    <div className="min-h-full p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <h1 className="font-type text-3xl text-[#f3ecd8] drop-shadow">{sacked ? 'Clearing your desk…' : <><FlagIcon code={g.activeCountry} emoji={COUNTRIES[g.activeCountry].flag} /> Incoming faxes for {g.manager.name}</>}</h1>
          <button className="btn btn-sm flex items-center gap-1" onClick={resetCareer}><RotateCcw size={14} /> New career</button>
        </div>
        {sacked && termination && (
          <div className="fax p-6 mb-8 max-w-2xl rotate-[-0.6deg]">
            <div className="flex justify-between text-xs"><span>FROM: {termination.from}</span><span>WK {termination.week} / {termination.season}</span></div>
            <div className="text-2xl font-bold mt-2">{termination.title}</div>
            <pre className="whitespace-pre-wrap font-mono text-sm mt-2">{termination.body}</pre>
            <div className="stamp stamp-red text-2xl mt-3">TERMINATED</div>
          </div>
        )}
        {sacked && (
          <div className="paper p-4 max-w-2xl mb-6 flex flex-wrap items-center gap-3">
            <span className="flex-1 text-sm">{g.jobOffers.length === 0 ? 'No club has called yet.' : 'Take a lifeline below,'} or sit by the phone a little longer — a desperate chairman may still ring.</span>
            <button className="btn btn-sm" onClick={() => (g.season.matchweek > 30 ? nextSeason() : playMatchweek())}>WAIT A WEEK ⏭</button>
          </div>
        )}
        <div className="grid md:grid-cols-3 gap-6">
          {g.jobOffers.map((o, i) => <OfferFax key={o.id} g={g} clubId={o.clubId} lifeline={o.isLifeline} tilt={i % 2 ? 0.8 : -0.8} onAccept={() => acceptJob(o.id)} />)}
        </div>
        {!sacked && (
          <div className="mt-10">
            <button className="text-[#e8cf8f] underline font-mono text-lg flex items-center gap-2" onClick={() => setFree(!free)}>
              <Shuffle size={16} /> {free ? 'Hide' : 'Casual mode: Free Pick any club'}
            </button>
            {free && <FreePick g={g} onPick={freePick} />}
          </div>
        )}
      </div>
    </div>
  );
}

function OfferFax({ g, clubId, lifeline, tilt, onAccept }: { g: GameState; clubId: string; lifeline: boolean; tilt: number; onAccept: () => void }) {
  const c = g.clubs[clubId];
  const arch = c.archetype ? ARCHETYPES[c.archetype] : null;
  const strength = useMemo(() => squadStrength(g, c), [g, c]);
  const wages = weeklyWageBill(g, c);
  const coach = c.staff.HEAD_COACH ? starsFromInternal(g.staff[c.staff.HEAD_COACH].ability) : 1;
  return (
    <div className="fax p-5 flex flex-col" style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="flex justify-between text-[11px] opacity-70"><span>FAX FROM: {c.name.toUpperCase()}</span><span>{lifeline ? 'URGENT' : 'PAGE 1/1'}</span></div>
      <div className="mt-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full border-4" style={{ background: c.colors[0], borderColor: c.colors[1] }} />
        <div className="text-xl font-bold leading-6">{c.name}</div>
      </div>
      <div className="text-sm opacity-80">{g.leagues[c.leagueId].name} (Tier {c.tier})</div>
      {arch && <div className="mt-2 stamp stamp-blue text-sm self-start">{arch.name.toUpperCase()}</div>}
      <p className="mt-3 text-sm italic">{arch ? arch.pitch : lifeline ? 'We are in a mess. Can you save us?' : 'We need a manager.'}</p>
      {arch && (
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <ul>{arch.pros.map((p) => <li key={p} className="text-green-800">+ {p}</li>)}</ul>
          <ul>{arch.cons.map((p) => <li key={p} className="text-red-800">− {p}</li>)}</ul>
        </div>
      )}
      <div className="mt-3 text-sm font-mono space-y-[1px] border-t border-dashed border-black/30 pt-2">
        <div>SQUAD RATING ....... {Math.round(strength)}</div>
        <div>BANK ............... {fmtMoney(c.finances.bank)}</div>
        <div>WAGE BILL .......... {fmtMoney(wages.players + wages.staff)}/wk</div>
        <div>STADIUM ............ {c.capacity.toLocaleString()}</div>
        <div>REPUTATION ......... {c.reputation}</div>
        <div className="flex items-center gap-1">HEAD COACH ......... <Stars value={coach} size={12} /></div>
        <div>BOARD GOAL ......... {c.board.goal.label}</div>
      </div>
      <button className="btn btn-green mt-4 text-xl" onClick={onAccept}>SIGN CONTRACT ✍</button>
    </div>
  );
}

function FreePick({ g, onPick }: { g: GameState; onPick: (id: string) => void }) {
  const leagues = Object.values(g.leagues).filter((l) => !l.isShadow).sort((a, b) => a.tier - b.tier);
  return (
    <div className="grid md:grid-cols-3 gap-4 mt-4">
      {leagues.map((lg) => (
        <CRTMonitor key={lg.id} title={lg.name}>
          <div className="space-y-[2px] max-h-80 overflow-y-auto crt-scroll">
            {lg.clubIds.map((id) => g.clubs[id]).sort((a, b) => b.reputation - a.reputation).map((c) => (
              <button key={c.id} className="w-full text-left hover:bg-white/10 px-1 flex justify-between" onClick={() => onPick(c.id)}>
                <span className="t-white">{c.name}</span><span className="t-dim">REP {c.reputation}</span>
              </button>
            ))}
          </div>
        </CRTMonitor>
      ))}
    </div>
  );
}
