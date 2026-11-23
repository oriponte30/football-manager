import { useState } from 'react';
import { X, Search, Send, FileSignature, Plane, UserMinus, Tag } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, Modal, StatBar, MoraleIcon, FitnessBar, FormDots, PosTag, paRead, ovrRead, Stars, NationTag, InjuryBadge, valueRead, valueKnown, roughValue } from '../ui';
import { SEVERITY_LABEL } from '../../data/injuries';
import { OUTFIELD_STATS, GK_STATS, MORALE_LABELS, type IndividualTrainingFocus, type StatKey } from '../../types/player';
import { avgRating, fullName, moraleLevel } from '../../engine/ratings';
import { valuePlayer, demandedWage, renewalDemand, windowOpen, signingBonus } from '../../engine/transferEngine';
import { fmtMoney } from '../../engine/financeEngine';
import { fogStatRange } from '../../engine/scoutingEngine';

const LABEL: Record<StatKey, string> = {
  shooting: 'Shooting', passing: 'Passing', dribbling: 'Dribbling', defending: 'Defending', pace: 'Pace', physical: 'Physical',
  reflexes: 'Reflexes', handling: 'Handling', positioning: 'Positioning', kicking: 'Kicking',
};
const FOCI: IndividualTrainingFocus[] = ['NONE', 'SHOOTING', 'PASSING', 'DRIBBLING', 'DEFENDING', 'PACE', 'PHYSICAL', 'GOALKEEPING'];

/** Manila folder: 1–99 stats, offset PA range, traits, form. */
export default function PlayerDossierModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const g = useGame();
  const club = useUserClub();
  const p = g.players[playerId];
  const own = p.clubId === club.id;
  const prospect = g.pendingYouth.includes(p.id);
  const report = g.scoutReports[p.id];
  const known = own || prospect;
  const keys = p.position === 'GK' ? GK_STATS : OUTFIELD_STATS;
  const pa = paRead(g, p, club);
  const ovr = ovrRead(g, p, club.id);
  const pc = p.clubId ? g.clubs[p.clubId] : null;
  const scouting = g.scouting.some((s) => s.playerId === p.id);
  const crisp = known ? 1 : report ? report.clarity : 0;
  const traitsShown = known ? p.traits : report ? report.revealedTraits : [];
  const hiddenTraits = known ? 0 : report ? report.hiddenTraitCount : p.traits.length;

  return (
    <Modal onClose={onClose} wide>
      <div className="manila p-5 pt-6 mt-6 relative">
        <div className="manila-tab">PLAYER DOSSIER · FILE #{p.id.toUpperCase()}</div>
        <button className="absolute top-2 right-2 btn btn-sm" onClick={onClose}><X size={16} /></button>
        <div className="grid md:grid-cols-[1.2fr_1fr] gap-5">
          <div className={`paper p-4 ${crisp < 0.4 && !known ? 'fax-messy' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold leading-7">{fullName(p)}</div>
                <div className="text-sm flex items-center gap-2 mt-1">
                  <PosTag pos={p.position} />{p.listed && <span className="text-[11px] bg-red-700 text-white px-1 rounded">{p.listed.kind === 'TRANSFER' ? 'FOR SALE' : 'LOAN LIST'}</span>} Age {p.age} · <NationTag code={p.nationality} full /> · {pc ? pc.name : prospect ? 'Academy prospect' : 'Free agent'}
                  {p.loanFromClubId && <span className="text-xs bg-blue-700 text-white px-1 rounded">ON LOAN from {g.clubs[p.loanFromClubId]?.name}</span>}
                </div>
                <div className="text-sm mt-1"><span className="opacity-60">Profile:</span> <span className="handwritten text-base">{p.playstyle}</span> <span className="opacity-60">· natural role</span> {p.preferredRole}</div>
              </div>
              <div className="text-right">
                <div className="text-xs opacity-60">CURRENT ABILITY</div>
                <div className={`stamp ${known ? 'stamp-green' : 'stamp-blue'} text-3xl`}>{ovr.text}{!ovr.exact && ovr.range[1] - ovr.range[0] > 12 ? '?' : ''}</div>
              </div>
            </div>
            {p.injuryWeeks > 0 && (
              <div className="medical-slip mt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold tracking-wider">MEDICAL REPORT</span>
                  <InjuryBadge p={p} large />
                </div>
                {p.injury && <div className="text-sm mt-1">
                  {p.injury.name} · {SEVERITY_LABEL[p.injury.severity]} · picked up {p.injury.source === 'TRAINING' ? 'in training' : 'in a match'} (MW {p.injury.matchweek}, {p.injury.year}) · expected back in <b>{p.injuryWeeks} week{p.injuryWeeks > 1 ? 's' : ''}</b>
                  <div className="h-2 mt-1 bg-black/10 rounded-sm overflow-hidden"><div className="h-full bg-red-700" style={{ width: `${Math.round(100 * (1 - p.injuryWeeks / Math.max(1, p.injury.weeksTotal)))}%` }} /></div>
                </div>}
                <div className="text-xs opacity-70 mt-1">Unavailable for selection until fit.</div>
              </div>
            )}
            <div className="mt-3 space-y-1">
              {keys.map((k) => {
                if (known) return <StatBar key={k} label={LABEL[k]} value={p.stats[k]} />;
                if (report?.statRanges[k]) return <StatBar key={k} label={LABEL[k]} range={report.statRanges[k]} />;
                return <StatBar key={k} label={LABEL[k]} range={fogStatRange(p.stats[k], p.paSeed, `none:${k}`)} />;
              })}
            </div>
            {!known && !report && <div className="handwritten mt-2">No scout report — these are newspaper guesses. Send the scout for a proper read.</div>}
            {report && !known && (
              <div className="mt-2 text-sm">
                <span className="opacity-70">Report by {report.staffStars}★ scout (wk {report.week}/{report.season}):</span> <span className="handwritten">"{report.verdict}"</span>
                {report.notes && report.notes.length > 0 && (
                  <ul className="handwritten mt-1 list-disc pl-5 leading-5">
                    {report.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="paper p-3">
              <div className="text-xs opacity-60">POTENTIAL ({pa.staffLabel}{pa.stars ? ` · ${pa.stars}★ read` : ''})</div>
              {pa.range ? (
                <div className="flex items-center gap-3">
                  <span className={`stamp ${pa.stars >= 4 ? 'stamp-green' : pa.stars >= 2.5 ? 'stamp-blue' : 'stamp-red'} text-2xl`}>{pa.range[0]}–{pa.range[1]}</span>
                  <span className="handwritten">{pa.range[1] >= 85 ? 'Could be a superstar!' : pa.range[1] >= 75 ? 'Real talent here.' : pa.range[1] - p.ca <= 3 ? 'Near his ceiling.' : 'Some room to grow.'}</span>
                </div>
              ) : <div className="handwritten">Unknown. Scout him.</div>}
              <div className="text-[11px] opacity-60 mt-1">Ranges are staff opinions, offset from the truth. Better staff = tighter, more honest reads. Reads narrow by age 24–25.</div>
            </div>
            <div className="paper p-3 text-sm">
              <div className="text-xs opacity-60">TRAITS</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {traitsShown.map((t) => <span key={t} className="handwritten border-b border-blue-900/40">{t}</span>)}
                {Array.from({ length: hiddenTraits }, (_, i) => <span key={i} className="handwritten opacity-50">???</span>)}
                {traitsShown.length === 0 && hiddenTraits === 0 && <span className="opacity-60">None noted</span>}
              </div>
            </div>
            <div className="paper p-3 text-sm grid grid-cols-2 gap-1">
              {(known || report) && <>
                <span>Fitness</span><FitnessBar value={p.fitness} injured={p.injuryWeeks} player={p} />
                <span>Morale</span><span className="flex items-center gap-1"><MoraleIcon value={p.moraleValue} /> {MORALE_LABELS[moraleLevel(p.moraleValue)]}</span>
                <span>Form</span><span className="flex items-center gap-1"><FormDots p={p} />{p.streak > 0 ? ' Purple patch' : p.streak < 0 ? ' Cold streak' : ''}</span>
              </>}
              <span>Season</span><span>{p.season.apps} apps · {p.season.goals} G · {p.season.assists} A · {avgRating(p).toFixed(2)} avg</span>
              <span>xG / xA</span><span>{p.season.xg.toFixed(1)} / {p.season.xa.toFixed(1)}</span>
              <span>Contract</span><span>{p.clubId ? `${fmtMoney(p.contract.wage)}/wk · ${p.contract.yearsLeft} yr left` : 'None'}</span>
              {p.contract.releaseClause !== null && <><span>Release clause</span><span className="text-red-800">{fmtMoney(p.contract.releaseClause)}</span></>}
              <span>Market value</span><span>{valueRead(g, p, club.id)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {own && <OwnActions playerId={p.id} />}
          {!own && !prospect && p.clubId && <BidDesk playerId={p.id} scouting={scouting} hasReport={!!report} />}
          {!own && !prospect && !p.clubId && <FreeAgentDesk playerId={p.id} scouting={scouting} hasReport={!!report} />}
        </div>
      </div>
    </Modal>
  );
}

function OwnActions({ playerId }: { playerId: string }) {
  const g = useGame();
  const s = useGameStore();
  const p = g.players[playerId];
  const club = useUserClub();
  const [wage, setWage] = useState(renewalDemand(g, p));
  const [years, setYears] = useState(3);
  const tagged = club.tactics.trainingTags.includes(p.id);
  const [ask, setAsk] = useState(Math.round((p.listed?.ask || valuePlayer(p) * 1.1) / 5000) * 5000);
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div className="paper p-3">
        <div className="font-bold flex items-center gap-1"><FileSignature size={16} /> Contract renewal</div>
        <div className="text-xs opacity-70">Unhappy players refuse; happy ones ask less.</div>
        <div className="flex gap-2 mt-2 items-center">
          <input type="number" className="desk-input w-28" value={wage} step={50} onChange={(e) => setWage(Number(e.target.value))} />/wk
          <select className="desk-input" value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} yr</option>)}</select>
        </div>
        <button className="btn btn-green btn-sm mt-2" disabled={!!p.loanFromClubId} onClick={() => s.renew(p.id, wage, years)}>OFFER NEW DEAL</button>
      </div>
      <div className="paper p-3">
        <div className="font-bold">Individual training</div>
        <select className="desk-input w-full mt-2" value={p.trainingFocus} onChange={(e) => s.setIndividualFocus(p.id, e.target.value as IndividualTrainingFocus)}>
          {FOCI.map((f) => <option key={f} value={f}>{f === 'NONE' ? 'No specific focus' : f}</option>)}
        </select>
        <button className={`btn btn-sm mt-2 ${tagged ? 'btn-amber' : ''}`} onClick={() => s.toggleTrainingTag(p.id)}>{tagged ? 'TAGGED ◆ (untag)' : 'TAG FOR FOCUS'}</button>
        <div className="text-xs opacity-70 mt-1">Tag 2–3 players to tilt which stats absorb their XP.</div>
      </div>
      <div className="paper p-3 space-y-2">
        <div className="font-bold">Squad decisions</div>
        <div className="border border-dashed border-black/30 rounded p-2 space-y-1">
          <div className="text-xs uppercase tracking-wider opacity-70 flex items-center gap-1"><Tag size={12} /> Shop window</div>
          {p.listed && <div className="text-sm font-bold text-red-800">{p.listed.kind === 'TRANSFER' ? `ON THE TRANSFER LIST · ${fmtMoney(p.listed.ask)}` : 'ON THE LOAN LIST'}</div>}
          {!p.loanFromClubId ? <>
            <div className="flex items-center gap-1 text-sm">Asking <input type="number" className="desk-input w-28" value={ask} step={5000} onChange={(e) => setAsk(Number(e.target.value))} /></div>
            <div className="flex gap-1 flex-wrap">
              <button className="btn btn-amber btn-sm" onClick={() => s.listPlayer(p.id, 'TRANSFER', ask)}>{p.listed?.kind === 'TRANSFER' ? 'UPDATE PRICE' : 'TRANSFER LIST'}</button>
              <button className="btn btn-sm" onClick={() => s.listPlayer(p.id, 'LOAN')}>LOAN LIST</button>
              {p.listed && <button className="btn btn-sm" onClick={() => s.listPlayer(p.id, null)}>TAKE OFF</button>}
            </div>
            <div className="text-[11px] opacity-70">Value ~{fmtMoney(valuePlayer(p))}. Clubs bid for listed players more often, near your price (not far above his value). Loan-listed players go out until summer; the other club pays his wages. Being listed unsettles him a little.</div>
          </> : <div className="text-xs opacity-70">He is a loanee. Not yours to list.</div>}
        </div>
        {p.age <= 23 && !p.loanFromClubId && <button className="btn btn-sm flex items-center gap-1" onClick={() => s.loanOut(p.id)}><Plane size={14} /> LOAN OUT FOR MINUTES</button>}
        <button className="btn btn-red btn-sm flex items-center gap-1" disabled={!!p.loanFromClubId} onClick={() => { s.release(p.id); s.openDossier(null); }}><UserMinus size={14} /> RELEASE (pay-off {fmtMoney(p.contract.wage * 8 * Math.max(1, p.contract.yearsLeft))})</button>
      </div>
    </div>
  );
}

function BidDesk({ playerId, scouting, hasReport }: { playerId: string; scouting: boolean; hasReport: boolean }) {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const p = g.players[playerId];
  const [type, setType] = useState<'TRANSFER' | 'LOAN'>('TRANSFER');
  const [fee, setFee] = useState(valueKnown(g, p, club.id) ? valuePlayer(p) : roughValue(p));
  const [wage, setWage] = useState(demandedWage(p, club, g));
  const [years, setYears] = useState(3);
  const [include, setInclude] = useState(false);
  const [incId, setIncId] = useState('');
  const [share, setShare] = useState(1);
  const scoutStars = club.staff.CHIEF_SCOUT ? g.staff[club.staff.CHIEF_SCOUT].ability / 10 : 1;
  const mine = club.playerIds.map((id) => g.players[id]).filter((x) => x && !x.loanFromClubId).sort((a, b) => b.ca - a.ca);
  const open = windowOpen(g);
  return (
    <div className="grid md:grid-cols-[1fr_2fr] gap-3">
      <div className="paper p-3">
        <div className="font-bold flex items-center gap-1"><Search size={16} /> Step 1 · Scout</div>
        <div className="text-sm">Your Chief Scout: <Stars value={Math.round(scoutStars * 2) / 2} size={12} /></div>
        <button className="btn btn-sm mt-2" disabled={scouting} onClick={() => s.scout(p.id)}>{scouting ? 'SCOUT ASSIGNED…' : hasReport ? 'RE-SCOUT' : 'SEND SCOUT'}</button>
        <div className="text-xs opacity-70 mt-1">Report arrives by fax in {scoutStars >= 3 ? '1 week' : '2 weeks'}.</div>
      </div>
      <div className="paper p-3">
        <div className="font-bold flex items-center gap-1"><Send size={16} /> Step 2 · Fax a bid {!open && <span className="text-red-700 text-sm ml-2">(window closed — opens MW 15–18 / summer)</span>}</div>
        <div className="flex flex-wrap gap-3 items-center mt-2 text-sm">
          <div className="seg"><button className={type === 'TRANSFER' ? 'on' : ''} onClick={() => setType('TRANSFER')}>TRANSFER</button><button className={type === 'LOAN' ? 'on' : ''} onClick={() => setType('LOAN')}>LOAN</button></div>
          {type === 'TRANSFER' ? (
            <>
              <label>Fee $<input type="number" className="desk-input w-32 ml-1" step={5000} value={fee} onChange={(e) => setFee(Number(e.target.value))} /></label>
              <label>Wage $<input type="number" className="desk-input w-24 ml-1" step={50} value={wage} onChange={(e) => setWage(Number(e.target.value))} />/wk</label>
              <label><select className="desk-input" value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} yr</option>)}</select></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} /> Include player</label>
              {include && (
                <select className="desk-input" value={incId} onChange={(e) => setIncId(e.target.value)}>
                  <option value="">— choose —</option>
                  {mine.map((m) => <option key={m.id} value={m.id}>{m.lastName} ({m.position}, {m.ca})</option>)}
                </select>
              )}
            </>
          ) : (
            <label>You pay <input type="range" min={0.5} max={1} step={0.05} value={share} onChange={(e) => setShare(Number(e.target.value))} /> {Math.round(share * 100)}% of {fmtMoney(p.contract.wage)}/wk</label>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button className="btn btn-amber" disabled={!open || club.finances.bank < 0} onClick={() => s.bid({ playerId: p.id, fee, wage, years, includePlayerId: include && incId ? incId : null, type, loanWageShare: share })}>FAX BID ▶</button>
          <span className="text-xs opacity-70">Step 3 · Reply arrives next turn: Accept / Counter / Reject. Then sign the contract from the fax.</span>
        </div>
        {club.finances.bank < 0 && <div className="text-red-700 text-sm mt-1">IN THE RED — signings are blocked.</div>}
      </div>
    </div>
  );
}

function FreeAgentDesk({ playerId, scouting, hasReport }: { playerId: string; scouting: boolean; hasReport: boolean }) {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const p = g.players[playerId];
  const [wage, setWage] = useState(demandedWage(p, club, g));
  const [years, setYears] = useState(p.age >= 32 ? 1 : 2);
  return (
    <div className="paper p-3 flex flex-wrap items-center gap-3">
      <span className="font-bold">Free agent — no fee · signing bonus {fmtMoney(signingBonus(g, p, club, wage))}</span>
      <button className="btn btn-sm" disabled={scouting} onClick={() => s.scout(p.id)}>{scouting ? 'SCOUTING…' : hasReport ? 'RE-SCOUT' : 'SCOUT'}</button>
      <label>Wage $<input type="number" className="desk-input w-24 ml-1" step={50} value={wage} onChange={(e) => setWage(Number(e.target.value))} />/wk</label>
      <select className="desk-input" value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} yr</option>)}</select>
      <button className="btn btn-green" onClick={() => s.signFree(p.id, wage, years)}>OFFER CONTRACT</button>
    </div>
  );
}
