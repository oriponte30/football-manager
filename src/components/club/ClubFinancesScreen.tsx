import { Landmark, Building, Dumbbell, GraduationCap, UserPlus, Trophy, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, Stars } from '../ui';
import CRTMonitor from '../layout/CRTMonitor';
import { fmtMoney, weeklyWageBill, weeklyBill, spendable, RESERVE_WEEKS, facilityUpgradeCost, wageCap, type FacilityKey } from '../../engine/financeEngine';
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from '../../types/staff';
import { starsFromInternal } from '../../engine/ratings';
import { staffCeiling, staffInterest } from '../../engine/staffGenerator';
import { COUNTRIES } from '../../data/countries';

const ROLE_HELP: Record<StaffRole, string> = {
  HEAD_COACH: 'Weekly XP, tactical familiarity, PA reads on your squad, prevents early plateaus.',
  CHIEF_SCOUT: 'Tighter stat/PA ranges, faster faxes (3★+ = 1 week), reveals hidden traits.',
  YOUTH_DIRECTOR: 'Better quarterly intakes and superstar odds; reads your prospects.',
  PHYSIO: 'Faster stamina recovery between matchweeks, shorter injury lay-offs.',
};

export default function ClubFinancesScreen() {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const wages = weeklyWageBill(g, club);
  const L = club.finances.ledger;
  const income = L.tickets + L.tv + L.prize + L.sales;
  const spend = L.wages + L.staff + L.transfers + L.facilities;
  const cap = wageCap(club);
  const [hireRole, setHireRole] = useState<StaffRole | null>(null);
  const fac: { key: FacilityKey; label: string; icon: typeof Building; help: string }[] = [
    { key: 'stadium', label: 'Stadium', icon: Building, help: `${club.capacity.toLocaleString()} capacity. More seats = bigger gates.` },
    { key: 'training', label: 'Training Ground', icon: Dumbbell, help: 'Boosts weekly XP for the whole squad.' },
    { key: 'youth', label: 'Youth Academy', icon: GraduationCap, help: 'Raises intake quality & superstar odds.' },
  ];
  return (
    <div className="grid xl:grid-cols-[1fr_1fr] gap-5">
      <div className="space-y-5">
        <CRTMonitor title="CLUB ACCOUNTS" page="500">
          <div className={`text-4xl ${club.finances.bank < 0 ? 't-red blink' : 't-green'}`}>{fmtMoney(club.finances.bank)}</div>
          {club.finances.bank < 0 && <div className="t-red">IN THE RED — new signings blocked, board confidence falling every week.</div>}
          <div className="grid grid-cols-2 gap-x-6 mt-2">
            <div className="t-white">WEEKLY WAGE BILL</div><div>{fmtMoney(wages.players + wages.staff)} <span className="t-dim">(players {fmtMoney(wages.players)}, staff {fmtMoney(wages.staff)})</span></div>
            <div className="t-white">SAFE BUDGET</div><div className={spendable(g, club) > 0 ? 't-green' : 't-red'}>{fmtMoney(Math.max(0, spendable(g, club)))} <span className="t-dim">(a guide: bank minus {RESERVE_WEEKS} weeks of wages. Not a limit, but dipping below it risks the red)</span></div>
            <div className="t-white">CASH RUNWAY</div><div>{weeklyBill(g, club) > 0 ? `${Math.max(0, Math.floor(club.finances.bank / weeklyBill(g, club)))} weeks of wages in the bank` : '–'}</div>
            {cap !== null && <><div className="t-white">LEAGUE WAGE CAP</div><div>{fmtMoney(cap)}/wk ({Math.round((wages.players / cap) * 100)}% used)</div></>}
          </div>
          <div className="mt-3 t-cyan">CASH FLOW THIS SEASON</div>
          <div className="grid grid-cols-2 gap-x-6">
            <Line k="Gate receipts" v={L.tickets} />
            <Line k="Wages (players)" v={-L.wages} />
            <Line k="TV / sponsorship" v={L.tv} />
            <Line k="Wages (staff)" v={-L.staff} />
            <Line k="Prize money" v={L.prize} />
            <Line k="Transfer fees" v={-L.transfers} />
            <Line k="Player sales" v={L.sales} />
            <Line k="Facilities" v={-L.facilities} />
          </div>
          <div className="mt-1 t-white">NET: <span className={income - spend >= 0 ? 't-green' : 't-red'}>{fmtMoney(income - spend)}</span></div>
          <div className="t-dim text-base mt-1">TV money comes in weekly (70%, by your current league position) with a merit payment at season end (30%, by final position), scaled by tier and fan interest ({COUNTRIES[club.country].name}: ×{COUNTRIES[club.country].tvMoneyMult}).</div>
        </CRTMonitor>

        <div className="paper p-4">
          <div className="font-bold flex items-center gap-2"><Landmark size={16} /> FACILITY UPGRADES</div>
          <div className="grid md:grid-cols-3 gap-3 mt-2">
            {fac.map((f) => {
              const cost = facilityUpgradeCost(club, f.key);
              return (
                <div key={f.key} className="border border-black/20 rounded p-2">
                  <div className="flex items-center gap-1 font-bold"><f.icon size={15} /> {f.label}</div>
                  <div className="text-xs">Level {club.facilities[f.key]}/5</div>
                  <div className="flex gap-[2px] my-1">{[1, 2, 3, 4, 5].map((l) => <span key={l} className={`h-2 flex-1 ${l <= club.facilities[f.key] ? 'bg-green-700' : 'bg-black/15'}`} />)}</div>
                  <div className="text-xs opacity-80">{f.help}</div>
                  <button className="btn btn-sm mt-2 w-full" disabled={cost === null || club.finances.bank < (cost ?? 0)} onClick={() => s.upgrade(f.key)}>{cost === null ? 'MAXED' : `UPGRADE ${fmtMoney(cost)}`}</button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="newspaper p-4">
          <h3 className="text-lg flex items-center gap-2"><Trophy size={16} /> Manager's Career — {g.manager.name}</h3>
          <div className="text-sm grid grid-cols-2 gap-1 mt-1">
            <span>Reputation</span><span>{Math.round(g.manager.reputation)}/100</span>
            <span>Seasons</span><span>{g.manager.seasonsManaged}</span>
            <span>Record</span><span>{g.manager.wins}W of {g.manager.matchesManaged} matches</span>
            <span>Sackings</span><span>{g.manager.sackings}</span>
          </div>
          {g.manager.trophies.length > 0 && <ul className="text-sm mt-2 list-disc pl-5">{g.manager.trophies.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          {g.history.length > 0 && (
            <table className="text-sm w-full mt-2">
              <thead><tr className="text-left border-b border-black"><th>Year</th><th>Club</th><th>Tier</th><th>Pos</th><th>Cup</th></tr></thead>
              <tbody>{g.history.map((h) => <tr key={h.year + h.clubId}><td>{h.year}</td><td>{h.clubName}</td><td>{h.tier}</td><td>{h.position}</td><td className="text-xs">{h.cupResult}</td></tr>)}</tbody>
            </table>
          )}
          <button className="btn btn-sm mt-3 flex items-center gap-1" onClick={() => { if (window.confirm('Abandon this career and start again?')) s.resetCareer(); }}><RotateCcw size={14} /> NEW CAREER</button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="paper p-4">
          <div className="font-bold">BOARD CONFIDENCE</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-4 bg-black/15 rounded overflow-hidden"><div className={`h-full ${club.board.value < 30 ? 'bg-red-600' : club.board.value < 55 ? 'bg-yellow-500' : 'bg-green-600'}`} style={{ width: `${club.board.value}%` }} /></div>
            <b>{Math.round(club.board.value)}%</b>
          </div>
          <div className="text-sm mt-1">Season objective: <span className="handwritten">{club.board.goal.label}</span></div>
          <div className="text-xs opacity-70">Below ~18% a termination fax arrives. {club.board.patience > 1.3 ? 'This owner is IMPATIENT.' : club.board.patience < 0.8 ? 'The board is famously patient.' : ''}</div>
          <div className="font-bold mt-3">TEAM ATMOSPHERE</div>
          <div className="flex items-center gap-3"><div className="flex-1 h-3 bg-black/15 rounded overflow-hidden"><div className="h-full bg-blue-700" style={{ width: `${club.teamAtmosphere}%` }} /></div><b>{Math.round(club.teamAtmosphere)}</b></div>
          <div className="font-bold mt-3">FAN INTEREST</div>
          <div className="flex items-center gap-3"><div className="flex-1 h-3 bg-black/15 rounded overflow-hidden"><div className="h-full bg-black" style={{ width: `${club.fanInterest}%` }} /></div><b>{Math.round(club.fanInterest)}%</b></div>
          <div className="text-xs opacity-70">Fan interest scales home ticket sales, the end-of-season TV/sponsor multiplier and home advantage.</div>
        </div>

        <CRTMonitor title="BACKROOM STAFF" page="510">
          <div className="space-y-2">
            {STAFF_ROLES.map((role) => {
              const sid = club.staff[role];
              const st = sid ? g.staff[sid] : null;
              return (
                <div key={role} className="border border-amber-crt/40 p-2">
                  <div className="flex justify-between items-center">
                    <span className="t-cyan">{STAFF_ROLE_LABELS[role].toUpperCase()}</span>
                    <button className="border border-amber-crt/60 px-2 flex items-center gap-1" onClick={() => setHireRole(hireRole === role ? null : role)}><UserPlus size={14} /> {hireRole === role ? 'CLOSE' : 'HIRE'}</button>
                  </div>
                  {st ? (
                    <div className="flex flex-wrap gap-x-4 items-center">
                      <span className="t-white">{st.name}</span><Stars value={starsFromInternal(st.ability)} size={13} /><span>AGE {st.age}</span><span>{fmtMoney(st.wage)}/wk</span>
                    </div>
                  ) : <div className="t-red">VACANT</div>}
                  <div className="t-dim text-base">{ROLE_HELP[role]}</div>
                  {hireRole === role && (
                    <div className="mt-1 border-t border-amber-crt/30 pt-1">
                      <div className="t-dim text-base">Your club can attract up to about <span className="t-white">{(Math.floor(staffCeiling(club) * 2) / 2).toFixed(1)}★</span>. Better people want more money, or won't come at all. Wages come out of the weekly bill; the up-front cost is a signing-on fee plus the outgoing man's pay-off.</div>
                      {g.staffMarketIds.map((id) => g.staff[id]).filter((m) => m && m.role === role).sort((a, b) => b.ability - a.ability).map((m) => {
                        const it = staffInterest(g, club, m);
                        return (
                          <div key={m.id} className={`flex flex-wrap items-center gap-x-3 ${it.kind === 'REFUSES' ? 'opacity-50' : ''}`}>
                            <span className="t-white w-44 truncate">{m.name}</span><Stars value={starsFromInternal(m.ability)} size={12} /><span>AGE {m.age}</span>
                            {it.kind === 'REFUSES' ? (
                              <span className="t-red">{it.reason}</span>
                            ) : (
                              <>
                                <span className={it.kind === 'PREMIUM' ? 't-red' : ''}>{fmtMoney(it.wage)}/wk{it.kind === 'PREMIUM' ? ' (wants a premium)' : ''}</span>
                                <button className="border border-amber-crt/60 px-2" disabled={club.finances.bank < it.fee + it.payoff} onClick={() => { s.hire(m.id); setHireRole(null); }}>
                                  HIRE · {fmtMoney(it.fee + it.payoff)} up front
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="t-dim text-base mt-2">Staff can't be trained. At each rollover they drift ±0.1–0.3★ with age, results and a hidden ceiling — then retire.</div>
        </CRTMonitor>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: number }) {
  return <div className="flex justify-between"><span className="t-dim">{k}</span><span className={v < 0 ? 't-red' : v > 0 ? 't-green' : ''}>{fmtMoney(v)}</span></div>;
}
