import { useState, type DragEvent } from 'react';
import { Wand2, Dumbbell, Tag } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, FitnessBar, MoraleIcon, FormDots, PosTag, Stars, staffStars, InjuryBadge } from '../ui';
import CRTMonitor from '../layout/CRTMonitor';
import { FORMATIONS, FORMATION_IDS, ROLES_BY_POSITION, positionFit } from '../../data/formations';
import { ovrFor, playerName } from '../../engine/ratings';
import type { TeamDials, Duty, TeamTrainingFocus } from '../../types/tactics';
import type { Player } from '../../types/player';

const DIALS: { key: keyof TeamDials; label: string; opts: [string, string][] }[] = [
  { key: 'mentality', label: 'MENTALITY', opts: [['DEFENSIVE', 'Defensive'], ['BALANCED', 'Balanced'], ['ATTACKING', 'Attacking']] },
  { key: 'passingStyle', label: 'PASSING', opts: [['SHORT', 'Short'], ['BALANCED', 'Balanced'], ['DIRECT', 'Direct']] },
  { key: 'pressing', label: 'PRESSING', opts: [['LOW', 'Low Block'], ['MID', 'Mid Block'], ['HIGH', 'High Press']] },
  { key: 'attackingFocus', label: 'FOCUS', opts: [['WINGS', 'Wings'], ['BALANCED', 'Balanced'], ['MIDDLE', 'Middle']] },
];
const DUTIES: Duty[] = ['DEFEND', 'SUPPORT', 'ATTACK'];
const TRAINING: [TeamTrainingFocus, string][] = [['BALANCED', 'Balanced'], ['ATTACKING', 'Attacking'], ['DEFENDING', 'Defending'], ['PHYSICAL', 'Physical']];

export default function TacticsScreen() {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const [sel, setSel] = useState<number | null>(null);
  const t = club.tactics;
  const slots = FORMATIONS[t.formation].slots;
  const squad = club.playerIds.map((id) => g.players[id]).filter(Boolean);
  const inXI = new Set(t.lineup.filter(Boolean) as string[]);
  const coach = staffStars(g, club, 'HEAD_COACH');

  const onMagnetClick = (i: number) => {
    if (sel === null) setSel(i);
    else if (sel === i) setSel(null);
    else { s.swapSlots(sel, i); setSel(null); }
  };
  const onSquadClick = (p: Player) => {
    if (sel !== null) { s.placeInSlot(sel, p.id); setSel(null); }
    else s.openDossier(p.id);
  };
  const dropOnSlot = (i: number, e: DragEvent) => {
    e.preventDefault();
    const pid = e.dataTransfer.getData('player');
    const from = e.dataTransfer.getData('slot');
    if (from !== '') s.swapSlots(Number(from), i);
    else if (pid) s.placeInSlot(i, pid);
    setSel(null);
  };

  return (
    <div className="grid xl:grid-cols-[minmax(420px,560px)_1fr] gap-5">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="font-mono text-xl text-[#e8cf8f]">FORMATION</span>
          <div className="seg">
            {FORMATION_IDS.map((f) => <button key={f} className={t.formation === f ? 'on' : ''} onClick={() => s.setFormation(f)}>{f}</button>)}
          </div>
          <button className="btn btn-sm flex items-center gap-1" onClick={s.autoPick}><Wand2 size={14} /> AUTO-PICK</button>
        </div>
        {/* magnetic board */}
        <div className="board w-full aspect-[68/100] max-w-[560px]">
          <div className="pitch-lines"><div className="half" /><div className="circle" /><div className="box-top" /><div className="box-bottom" /></div>
          {slots.map((slot, i) => {
            const pid = t.lineup[i];
            const p = pid ? g.players[pid] : null;
            const fit = p ? positionFit(p.position, slot.pos) : 1;
            const role = t.roles[i];
            return (
              <div
                key={i}
                className={`magnet ${sel === i ? 'selected' : ''} ${p && fit < 1 ? 'oop' : ''}`}
                style={{ left: `${slot.x}%`, bottom: `${slot.y}%`, background: p ? `radial-gradient(circle at 35% 30%, ${club.colors[0]}ee, ${club.colors[0]} 60%, #000a)` : 'radial-gradient(circle at 35% 30%, #888, #444)', color: club.colors[1] }}
                onClick={() => onMagnetClick(i)}
                draggable={!!p}
                onDragStart={(e) => { e.dataTransfer.setData('slot', String(i)); e.dataTransfer.setData('player', pid ?? ''); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropOnSlot(i, e)}
                title={p ? `${p.firstName} ${p.lastName} — ${role?.role} (${role?.duty})${fit < 1 ? ' — OUT OF POSITION' : ''}` : 'Empty — click then pick a player'}
              >
                <span className="text-[13px] opacity-90">{slot.pos}</span>
                <span className="text-[19px] font-bold">{p ? Math.round(ovrFor(p.stats, slot.pos) * fit) : '?'}</span>
                <span className="absolute -bottom-5 whitespace-nowrap text-[15px] bg-black/70 text-white px-1 rounded">{p ? p.lastName : '—'}</span>
                {p && p.injuryWeeks > 0 && <span className="absolute -top-2 -right-3"><InjuryBadge p={p} /></span>}
              </div>
            );
          })}
        </div>
        <div className="text-[#e8cf8f] font-mono text-base">Click a magnet then another to swap · click a magnet then a squad player to bring him in · drag & drop works too. Red ring = out of position penalty.</div>
        {sel !== null && <RolePanel slotIdx={sel} />}
      </div>

      <div className="space-y-4">
        <CRTMonitor title="TEAM INSTRUCTIONS" page="210" right={<span>FAMILIARITY {Math.round(club.familiarity)}%</span>}>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
            {DIALS.map((d) => (
              <div key={d.key} className="flex items-center gap-2 justify-between">
                <span className="t-white w-24">{d.label}</span>
                <div className="flex">
                  {d.opts.map(([v, l]) => (
                    <button key={v} onClick={() => s.setDial(d.key, v as never)} className={`px-2 border border-amber-crt/50 ${t.dials[d.key] === v ? 'bg-amber-crt text-navy-900' : ''}`}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 h-2 bg-white/10"><div className="h-full bg-[#46ff7a]" style={{ width: `${club.familiarity}%` }} /></div>
          <div className="t-dim text-base mt-1">Changing shape or dials costs familiarity; it rebuilds over 3–5 matches (faster with a better Head Coach: <Stars value={coach} size={11} />).</div>
        </CRTMonitor>

        <div className="paper p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 font-bold"><Dumbbell size={16} /> TEAM TRAINING</span>
            <div className="seg">{TRAINING.map(([v, l]) => <button key={v} className={t.trainingFocus === v ? 'on' : ''} onClick={() => s.setTrainingFocus(v)}>{l}</button>)}</div>
            <span className="text-sm flex items-center gap-1"><Tag size={14} /> Individual focus: {t.trainingTags.length}/3 tagged (set in dossier)</span>
          </div>
        </div>

        <div className="paper p-3">
          <div className="flex justify-between items-baseline">
            <div className="font-bold">SQUAD ({squad.length}) · BENCH {t.bench.length}/7</div>
            <div className="text-xs opacity-70">{sel !== null ? `Pick a player for slot ${slots[sel].pos}` : 'Click a name for the dossier'}</div>
          </div>
          <div className="mt-2 grid grid-cols-[36px_1fr_40px_36px_58px_26px_70px_64px] text-xs uppercase opacity-60 px-1">
            <span>Pos</span><span>Name</span><span>Age</span><span>OVR</span><span>Fit</span><span>Mor</span><span>Form</span><span>Role</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {squad.sort((a, b) => order(a) - order(b) || b.ca - a.ca).map((p) => {
              const xi = inXI.has(p.id);
              const bench = t.bench.includes(p.id);
              return (
                <div key={p.id} draggable onDragStart={(e) => { e.dataTransfer.setData('player', p.id); e.dataTransfer.setData('slot', ''); }}
                  className={`grid grid-cols-[36px_1fr_40px_36px_58px_26px_70px_64px] items-center px-1 py-[2px] border-b border-black/10 text-sm cursor-pointer hover:bg-yellow-100/60 ${p.injuryWeeks > 0 ? 'injured-row' : xi ? 'bg-green-200/50' : bench ? 'bg-blue-100/50' : ''}`}
                  title={p.injuryWeeks > 0 ? `${p.injury?.name ?? 'Injured'} — unavailable for ${p.injuryWeeks} week${p.injuryWeeks > 1 ? 's' : ''}` : `${p.playstyle} · prefers ${p.preferredRole}`}
                  onClick={() => onSquadClick(p)}>
                  <PosTag pos={p.position} />
                  <span className="truncate">{playerName(p)}{p.loanFromClubId ? ' (L)' : ''}{t.trainingTags.includes(p.id) ? ' ◆' : ''}{p.contract.yearsLeft <= 1 ? ' ⏳' : ''}</span>
                  <span>{p.age}</span>
                  <span className="font-bold">{p.ca}</span>
                  <FitnessBar value={p.fitness} injured={p.injuryWeeks} player={p} />
                  <MoraleIcon value={p.moraleValue} />
                  <FormDots p={p} />
                  <span>
                    {xi ? <span className="text-green-800 text-xs font-bold">XI</span> : p.injuryWeeks > 0 ? <span className="text-red-700 text-xs font-bold">MEDICAL</span> : (
                      <button className={`text-xs px-1 border rounded ${bench ? 'bg-blue-700 text-white' : 'border-black/40'}`} onClick={(e) => { e.stopPropagation(); s.toggleBench(p.id); }}>{bench ? 'SUB ✓' : '+SUB'}</button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="text-xs mt-1 opacity-70">◆ individual training · ⏳ contract expiring · (L) loanee · ✚ injured (can't start) · subs are made automatically for tired/injured players, in bench order</div>
        </div>
      </div>
    </div>
  );
}

const ORDER: Record<string, number> = { GK: 0, CB: 1, LB: 2, RB: 3, CDM: 4, CM: 5, CAM: 6, LW: 7, RW: 8, ST: 9 };
const order = (p: Player) => ORDER[p.position] ?? 10;

function RolePanel({ slotIdx }: { slotIdx: number }) {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const slot = FORMATIONS[club.tactics.formation].slots[slotIdx];
  const r = club.tactics.roles[slotIdx];
  const pid = club.tactics.lineup[slotIdx];
  const p = pid ? g.players[pid] : null;
  return (
    <div className="manila p-4 pt-5 mt-6">
      <div className="manila-tab">ROLE & DUTY · {slot.pos}</div>
      <div className="font-type">{p ? `${p.firstName} ${p.lastName} (${p.position}, OVR ${p.ca})` : 'Empty slot'}</div>
      {p && <div className="text-sm handwritten">{p.playstyle} — natural role: {p.preferredRole}</div>}
      <div className="flex flex-wrap gap-2 mt-2">
        {ROLES_BY_POSITION[slot.pos].map((role) => (
          <button key={role} className={`btn btn-sm ${r?.role === role ? 'btn-amber' : ''}`} onClick={() => s.setRole(slotIdx, role)}>{role}</button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {DUTIES.map((d) => <button key={d} className={`btn btn-sm ${r?.duty === d ? 'btn-amber' : ''}`} onClick={() => s.setDuty(slotIdx, d)}>{d}</button>)}
      </div>
      {p && <button className="text-sm underline mt-2" onClick={() => s.openDossier(p.id)}>Open dossier</button>}
    </div>
  );
}
