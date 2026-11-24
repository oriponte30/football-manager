import { useMemo, useState, type DragEvent } from 'react';
import TeamStatsView from './TeamStatsView';
import { Wand2, Dumbbell, Tag, ArrowUpDown, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, FitnessBar, MoraleIcon, FormDots, PosTag, Stars, staffStars, InjuryBadge, NationTag, paRead } from '../ui';
import { PlayerFace } from '../Face';
import CRTMonitor from '../layout/CRTMonitor';
import { FORMATIONS, FORMATION_IDS, ROLES_BY_POSITION, positionFit } from '../../data/formations';
import { INSTRUCTIONS, instructionsFor } from '../../data/instructions';
import { ovrFor, playerName } from '../../engine/ratings';
import { valuePlayer } from '../../engine/transferEngine';
import { fmtMoney } from '../../engine/financeEngine';
import { OUTFIELD_STATS, GK_STATS, MORALE_LABELS } from '../../types/player';
import { moraleLevel } from '../../engine/ratings';
import type { TeamDials, Duty, TeamTrainingFocus } from '../../types/tactics';
import type { Player, StatKey } from '../../types/player';

const DIALS: { key: keyof TeamDials; label: string; opts: [string, string][] }[] = [
  { key: 'mentality', label: 'MENTALITY', opts: [['DEFENSIVE', 'Defensive'], ['BALANCED', 'Balanced'], ['ATTACKING', 'Attacking']] },
  { key: 'passingStyle', label: 'PASSING', opts: [['SHORT', 'Short'], ['BALANCED', 'Balanced'], ['DIRECT', 'Direct']] },
  { key: 'pressing', label: 'PRESSING', opts: [['LOW', 'Low Block'], ['MID', 'Mid Block'], ['HIGH', 'High Press']] },
  { key: 'attackingFocus', label: 'FOCUS', opts: [['WINGS', 'Wings'], ['BALANCED', 'Balanced'], ['MIDDLE', 'Middle']] },
];
const DUTIES: Duty[] = ['DEFEND', 'SUPPORT', 'ATTACK'];
const DUTY_HINT: Record<Duty, string> = {
  DEFEND: 'stays back. Defends and wins the ball more, shoots and creates less.',
  SUPPORT: 'balanced. Does a bit of both.',
  ATTACK: 'bombs forward. Shoots and creates more, helps less at the back.',
};
const TRAINING: [TeamTrainingFocus, string][] = [['BALANCED', 'Balanced'], ['ATTACKING', 'Attacking'], ['DEFENDING', 'Defending'], ['PHYSICAL', 'Physical']];
const ORDER: Record<string, number> = { GK: 0, CB: 1, LB: 2, RB: 3, CDM: 4, CM: 5, CAM: 6, LW: 7, RW: 8, ST: 9 };
const order = (p: Player) => ORDER[p.position] ?? 10;

export default function TacticsScreen() {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const [sel, setSel] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<'SQUAD' | 'ROSTER' | 'STATS'>('SQUAD');
  const t = club.tactics;
  const slots = FORMATIONS[t.formation].slots;
  const coach = staffStars(g, club, 'HEAD_COACH');

  const onMagnetClick = (i: number) => {
    const pid = t.lineup[i];
    if (sel === null) { setSel(i); if (pid) setFocus(pid); }
    else if (sel === i) setSel(null);
    else { s.swapSlots(sel, i); setSel(null); }
  };
  const dropOnSlot = (i: number, e: DragEvent) => {
    e.preventDefault();
    const pid = e.dataTransfer.getData('player');
    const from = e.dataTransfer.getData('slot');
    if (from !== '') s.swapSlots(Number(from), i);
    else if (pid) s.placeInSlot(i, pid);
    setSel(null);
  };
  /** clicking someone outside the XI: if a slot is picked, he goes straight in; otherwise open his card */
  const pickOutsider = (p: Player) => {
    if (sel !== null) { s.placeInSlot(sel, p.id); setSel(null); setFocus(p.id); }
    else setFocus(focus === p.id ? null : p.id);
  };

  return (
    <div className="grid xl:grid-cols-[minmax(420px,540px)_1fr] gap-5">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="font-mono text-xl text-[#e8cf8f]">FORMATION</span>
          <div className="seg">
            {FORMATION_IDS.map((f) => (
              <button key={f} className={t.formation === f ? 'on' : ''} onClick={() => s.setFormation(f)} title={`Familiarity ${Math.round(club.familiarityByFormation?.[f] ?? 35)}%`}>
                {f}<span className="fam-pip" style={{ width: `${Math.round((club.familiarityByFormation?.[f] ?? 35) / 10) * 2}px` }} />
              </button>
            ))}
          </div>
          <button className="btn btn-sm flex items-center gap-1" onClick={s.autoPick}><Wand2 size={14} /> AUTO-PICK</button>
        </div>
        <div className="board w-full aspect-[68/100] max-w-[540px]">
          <div className="pitch-lines"><div className="half" /><div className="circle" /><div className="box-top" /><div className="box-bottom" /></div>
          {slots.map((slot, i) => {
            const pid = t.lineup[i];
            const p = pid ? g.players[pid] : null;
            const fit = p ? positionFit(p.position, slot.pos) : 1;
            const role = t.roles[i];
            const instr = t.instructions?.[i];
            return (
              <div
                key={i}
                className={`magnet ${sel === i ? 'selected' : ''} ${p && fit < 1 ? 'oop' : ''} ${p && focus === p.id && sel !== i ? 'focused' : ''}`}
                style={{ left: `${slot.x}%`, bottom: `${slot.y}%`, background: p ? `radial-gradient(circle at 35% 30%, ${club.colors[0]}ee, ${club.colors[0]} 60%, #000a)` : 'radial-gradient(circle at 35% 30%, #888, #444)', color: club.colors[1] }}
                onClick={() => onMagnetClick(i)}
                draggable={!!p}
                onDragStart={(e) => { e.dataTransfer.setData('slot', String(i)); e.dataTransfer.setData('player', pid ?? ''); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropOnSlot(i, e)}
                title={p ? `${p.firstName} ${p.lastName} — ${role?.role} (${role?.duty})${instr ? ` · ${INSTRUCTIONS[instr].label}` : ''}${fit < 1 ? ' — OUT OF POSITION' : ''}` : 'Empty — click then pick a player'}
              >
                <span className="text-[13px] opacity-90">{slot.pos}</span>
                <span className="text-[19px] font-bold">{p ? Math.round(ovrFor(p.stats, slot.pos) * fit) : '?'}</span>
                <span className="absolute -bottom-5 whitespace-nowrap text-[15px] bg-black/70 text-white px-1 rounded">{p ? p.lastName : '—'}</span>
                {instr && <span className="instr-pin" />}
                {p && p.injuryWeeks > 0 && <span className="absolute -top-2 -right-3"><InjuryBadge p={p} /></span>}
              </div>
            );
          })}
        </div>
        <div className="text-[#e8cf8f] font-mono text-base">Click a magnet, then another to swap, or a bench player to bring him on. Drag and drop works too. A red ring means out of position. A small pin means the player has an instruction.</div>
        {sel !== null && <RolePanel slotIdx={sel} onClose={() => setSel(null)} />}
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
          <div className="mt-2 h-2 bg-white/10"><div className="h-full bg-[#46ff7a] transition-all" style={{ width: `${club.familiarity}%` }} /></div>
          <div className="t-dim text-base mt-1">
            Familiarity only moves when a match is played. Each shape keeps its own: play one to learn it, leave it and it fades slowly. Changing a dial costs a little on the day. Head Coach: <Stars value={coach} size={11} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-crt/30 pt-2">
            <span className="flex items-center gap-1 t-white"><Dumbbell size={15} /> TRAINING</span>
            {TRAINING.map(([v, l]) => (
              <button key={v} onClick={() => s.setTrainingFocus(v)} className={`px-2 border border-amber-crt/50 ${t.trainingFocus === v ? 'bg-amber-crt text-navy-900' : ''}`}>{l}</button>
            ))}
            <span className="t-dim text-base flex items-center gap-1"><Tag size={13} /> {t.trainingTags.length}/3 on individual focus</span>
          </div>
        </CRTMonitor>

        <div className="paper p-3">
          <div className="flex justify-between items-center">
            <div className="seg">
              <button className={view === 'SQUAD' ? 'on' : ''} onClick={() => setView('SQUAD')}>SQUAD</button>
              <button className={view === 'ROSTER' ? 'on' : ''} onClick={() => setView('ROSTER')}>ROSTER</button>
              <button className={view === 'STATS' ? 'on' : ''} onClick={() => setView('STATS')}>TEAM STATS</button>
            </div>
            <div className="text-xs opacity-70">{sel !== null ? `Pick someone for ${slots[sel].pos}` : `${club.playerIds.length} players · bench ${t.bench.length}/7`}</div>
          </div>
          {view === 'SQUAD' ? (
            <SquadView focus={focus} setFocus={setFocus} sel={sel} setSel={setSel} pickOutsider={pickOutsider} />
          ) : view === 'STATS' ? (
            <TeamStatsView onPick={(id) => s.openDossier(id)} />
          ) : (
            <RosterView onPick={(p) => s.openDossier(p.id)} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SquadView({ focus, setFocus, sel, setSel, pickOutsider }: {
  focus: string | null; setFocus: (id: string | null) => void; sel: number | null; setSel: (i: number | null) => void; pickOutsider: (p: Player) => void;
}) {
  const g = useGame();
  const club = useUserClub();
  const t = club.tactics;
  const slots = FORMATIONS[t.formation].slots;
  const squad = club.playerIds.map((id) => g.players[id]).filter(Boolean);
  const inXI = new Set(t.lineup.filter(Boolean) as string[]);
  const bench = t.bench.map((id) => g.players[id]).filter(Boolean);
  const reserves = squad.filter((p) => !inXI.has(p.id) && !t.bench.includes(p.id)).sort((a, b) => order(a) - order(b) || b.ca - a.ca);
  const focused = focus ? g.players[focus] : null;
  return (
    <div className="mt-2 space-y-3">
      {focused && focused.clubId === club.id && <PlayerCard p={focused} onClose={() => setFocus(null)} onPickSlot={(i) => setSel(i)} />}

      <section>
        <div className="sheet-h">STARTING XI</div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          {slots.map((slot, i) => {
            const pid = t.lineup[i];
            const p = pid ? g.players[pid] : null;
            const fit = p ? positionFit(p.position, slot.pos) : 1;
            return (
              <button key={i} onClick={() => { setSel(sel === i ? null : i); if (p) setFocus(p.id); }}
                className={`xi-row ${sel === i ? 'on' : ''} ${p && focus === p.id ? 'focus' : ''}`}>
                <span className="w-9 text-left"><PosTag pos={slot.pos} /></span>
                <span className="flex-1 truncate text-left">{p ? playerName(p) : <i className="opacity-60">empty</i>}{p && fit < 1 && <span className="text-red-700 text-xs"> ({p.position})</span>}</span>
                {p && <><span className="font-bold w-7 text-right">{Math.round(ovrFor(p.stats, slot.pos) * fit)}</span><FitnessBar value={p.fitness} player={p} /></>}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="sheet-h">BENCH <span className="opacity-60">{bench.length}/7 · click to compare, then start him</span></div>
        <div className="flex flex-wrap gap-2">
          {bench.map((p) => <FaceChip key={p.id} p={p} on={focus === p.id} onClick={() => pickOutsider(p)} onDrag />)}
          {bench.length === 0 && <div className="text-sm opacity-60">Nobody on the bench. Add players from the reserves below.</div>}
        </div>
      </section>

      <section>
        <div className="sheet-h">RESERVES <span className="opacity-60">{reserves.length} · not in the matchday squad</span></div>
        <div className="flex flex-wrap gap-2">
          {reserves.map((p) => <FaceChip key={p.id} p={p} on={focus === p.id} onClick={() => pickOutsider(p)} small onDrag />)}
        </div>
      </section>
    </div>
  );
}

function FaceChip({ p, on, onClick, small, onDrag }: { p: Player; on: boolean; onClick: () => void; small?: boolean; onDrag?: boolean }) {
  const club = useUserClub();
  return (
    <button
      className={`face-chip ${on ? 'on' : ''} ${small ? 'small' : ''} ${p.injuryWeeks > 0 ? 'hurt' : ''}`}
      onClick={onClick}
      draggable={onDrag}
      onDragStart={(e) => { e.dataTransfer.setData('player', p.id); e.dataTransfer.setData('slot', ''); }}
      title={`${p.firstName} ${p.lastName} · ${p.playstyle}`}
    >
      <PlayerFace p={p} size={small ? 34 : 44} shirt={club.colors[0]} />
      <span className="flex flex-col items-start leading-4 min-w-0">
        <span className="truncate max-w-[92px] text-sm font-semibold">{p.lastName}</span>
        <span className="flex items-center gap-1 text-xs"><PosTag pos={p.position} /> <b>{p.ca}</b> {p.injuryWeeks > 0 ? <InjuryBadge p={p} /> : <span className={`fit-dot ${p.fitness >= 85 ? 'ok' : p.fitness >= 65 ? 'mid' : 'low'}`} />}</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

/** Best XI slot for a player: his natural position first, then the weakest occupant. */
function bestSlotFor(g: ReturnType<typeof useGame>, club: ReturnType<typeof useUserClub>, p: Player): number {
  const slots = FORMATIONS[club.tactics.formation].slots;
  let best = 0, bestScore = -1;
  slots.forEach((slot, i) => {
    const occ = club.tactics.lineup[i] ? g.players[club.tactics.lineup[i] as string] : null;
    const fit = positionFit(p.position, slot.pos);
    const score = fit * 100 - (occ ? ovrFor(occ.stats, slot.pos) * positionFit(occ.position, slot.pos) : 0) * 0.2;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function PlayerCard({ p, onClose, onPickSlot }: { p: Player; onClose: () => void; onPickSlot: (i: number) => void }) {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const t = club.tactics;
  const slots = FORMATIONS[t.formation].slots;
  const xiIdx = t.lineup.indexOf(p.id);
  const inXI = xiIdx >= 0;
  const onBench = t.bench.includes(p.id);
  const defaultSlot = useMemo(() => (inXI ? -1 : bestSlotFor(g, club, p)), [g, club, p, inXI]);
  const [cmpSlot, setCmpSlot] = useState<number>(defaultSlot);
  const slotIdx = inXI ? -1 : cmpSlot;
  const vsId = slotIdx >= 0 ? t.lineup[slotIdx] : null;
  const vs = vsId ? g.players[vsId] : null;
  const keys: StatKey[] = p.position === 'GK' ? GK_STATS : OUTFIELD_STATS;
  const pa = paRead(g, p, club);
  const lvl = moraleLevel(p.moraleValue);
  return (
    <div className="player-card">
      <div className="flex gap-3">
        {inXI ? (
          <div className="card-magnet" style={{ background: `radial-gradient(circle at 35% 30%, ${club.colors[0]}ee, ${club.colors[0]} 60%, #000a)`, color: club.colors[1] }}>
            <span className="text-xs">{slots[xiIdx].pos}</span><b className="text-xl">{p.ca}</b>
          </div>
        ) : <PlayerFace p={p} size={64} shirt={club.colors[0]} className="rounded" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-type text-lg leading-5 truncate">{p.firstName} {p.lastName}</div>
              <div className="text-sm flex flex-wrap items-center gap-x-2"><PosTag pos={p.position} /> <NationTag code={p.nationality} /> <span>{p.age} yrs</span> <span className="italic">{p.playstyle}</span></div>
            </div>
            <button onClick={onClose} className="opacity-60 hover:opacity-100" title="Close"><X size={16} /></button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>OVR <b className="text-base">{p.ca}</b></span>
            <span title={`${pa.staffLabel}'s read`}>POT <b>{pa.range ? `${pa.range[0]}–${pa.range[1]}` : '?'}</b></span>
            <span className="flex items-center gap-1">FORM <FormDots p={p} /></span>
            <span className="flex items-center gap-1">FIT <FitnessBar value={p.fitness} player={p} /> {Math.round(p.fitness)}%</span>
            <span className="flex items-center gap-1"><MoraleIcon value={p.moraleValue} size={14} /> {MORALE_LABELS[lvl]}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-[3px]">
        {keys.map((k) => {
          const a = p.stats[k];
          const b = vs ? vs.stats[k] : undefined;
          return (
            <div key={k} className="cmp-row">
              <span className="uppercase tracking-wide text-xs w-20">{k}</span>
              <div className="cmp-track">
                <div className={`cmp-bar ${b !== undefined && a > b ? 'win' : ''}`} style={{ width: `${a}%` }} />
                {b !== undefined && <div className="cmp-mark" style={{ left: `${b}%` }} title={`${vs!.lastName}: ${b}`} />}
              </div>
              <span className="w-7 text-right font-mono font-bold">{a}</span>
              {b !== undefined && <span className={`w-9 text-right font-mono text-xs ${a > b ? 'text-green-700' : a < b ? 'text-red-700' : 'opacity-60'}`}>{a > b ? '+' : ''}{a - b}</span>}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {!inXI && (
          <>
            <span className="flex items-center gap-1 opacity-80"><ArrowUpDown size={13} /> vs</span>
            <select className="desk-input text-sm" value={cmpSlot} onChange={(e) => setCmpSlot(Number(e.target.value))}>
              {slots.map((sl, i) => {
                const o = t.lineup[i] ? g.players[t.lineup[i] as string] : null;
                return <option key={i} value={i}>{sl.pos} · {o ? o.lastName : 'empty'}{o ? ` (${o.ca})` : ''}</option>;
              })}
            </select>
            <button className="btn btn-sm btn-green" disabled={p.injuryWeeks > 0} onClick={() => s.placeInSlot(cmpSlot, p.id)}>
              START {vs ? `FOR ${vs.lastName.toUpperCase()}` : `AT ${slots[cmpSlot]?.pos}`}
            </button>
            <button className="btn btn-sm" disabled={p.injuryWeeks > 0 && !onBench} onClick={() => s.toggleBench(p.id)}>{onBench ? 'DROP FROM BENCH' : 'ADD TO BENCH'}</button>
          </>
        )}
        {inXI && <button className="btn btn-sm" onClick={() => onPickSlot(xiIdx)}>ROLE & INSTRUCTION</button>}
        <button className="btn btn-sm" onClick={() => s.openDossier(p.id)}>DOSSIER</button>
        {positionFit(p.position, inXI ? slots[xiIdx].pos : slots[cmpSlot]?.pos ?? p.position) < 1 && <span className="text-red-700 text-xs">out of position</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type SortKey = 'pos' | 'name' | 'age' | 'ovr' | 'pot' | 'value' | 'wage' | 'morale';

function RosterView({ onPick }: { onPick: (p: Player) => void }) {
  const g = useGame();
  const club = useUserClub();
  const [sort, setSort] = useState<SortKey>('pos');
  const t = club.tactics;
  const offers = new Set(g.bids.filter((b) => b.direction === 'INCOMING' && b.status === 'PENDING').map((b) => b.playerId));
  const rows = club.playerIds.map((id) => g.players[id]).filter(Boolean).map((p) => {
    const pa = paRead(g, p, club);
    return { p, pa: pa.range ? Math.round((pa.range[0] + pa.range[1]) / 2) : p.ca, paTxt: pa.range ? `${pa.range[0]}–${pa.range[1]}` : '?', value: valuePlayer(p) };
  });
  const cmp: Record<SortKey, (a: typeof rows[0], b: typeof rows[0]) => number> = {
    pos: (a, b) => order(a.p) - order(b.p) || b.p.ca - a.p.ca,
    name: (a, b) => a.p.lastName.localeCompare(b.p.lastName),
    age: (a, b) => a.p.age - b.p.age,
    ovr: (a, b) => b.p.ca - a.p.ca,
    pot: (a, b) => b.pa - a.pa,
    value: (a, b) => b.value - a.value,
    wage: (a, b) => b.p.contract.wage - a.p.contract.wage,
    morale: (a, b) => b.p.moraleValue - a.p.moraleValue,
  };
  rows.sort(cmp[sort]);
  const H = ({ k, children, className = '' }: { k: SortKey; children: string; className?: string }) => (
    <button className={`text-left ${sort === k ? 'underline font-bold' : ''} ${className}`} onClick={() => setSort(k)}>{children}</button>
  );
  const cols = 'grid grid-cols-[30px_34px_1fr_34px_40px_36px_52px_58px_54px_34px_24px_74px]';
  return (
    <div className="mt-2 overflow-x-auto">
      <div className="min-w-[680px]">
        <div className={`${cols} text-xs uppercase opacity-70 px-1 gap-x-1`}>
          <span /><H k="pos">Pos</H><H k="name">Name</H><H k="age">Age</H><span>Nat</span><H k="ovr">Ovr</H><H k="pot">Pot</H><H k="value">Value</H><H k="wage">Wage</H><span>Yrs</span><H k="morale">Mor</H><span>Status</span>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {rows.map(({ p, paTxt, value }) => {
            const status = p.injuryWeeks > 0 ? 'INJURED' : t.lineup.includes(p.id) ? 'XI' : t.bench.includes(p.id) ? 'BENCH' : p.loanFromClubId ? 'LOANEE' : 'RESERVE';
            return (
              <button key={p.id} onClick={() => onPick(p)} className={`${cols} w-full items-center px-1 py-[2px] gap-x-1 border-b border-black/10 text-sm text-left hover:bg-yellow-100/60`}>
                <PlayerFace p={p} size={26} shirt={club.colors[0]} />
                <PosTag pos={p.position} />
                <span className="truncate">{playerName(p)}{t.trainingTags.includes(p.id) ? ' ◆' : ''}{p.listed ? <span className="ml-1 text-[10px] bg-red-700 text-white px-1 rounded">{p.listed.kind === 'TRANSFER' ? 'SALE' : 'LOAN'}</span> : null}</span>
                <span>{p.age}</span>
                <NationTag code={p.nationality} />
                <b>{p.ca}</b>
                <span className="text-xs">{paTxt}</span>
                <span className="text-xs">{fmtMoney(value)}</span>
                <span className="text-xs">{fmtMoney(p.contract.wage)}</span>
                <span className={p.contract.yearsLeft <= 1 ? 'text-red-700 font-bold' : ''}>{p.contract.yearsLeft}</span>
                <MoraleIcon value={p.moraleValue} size={14} />
                <span className="text-[11px] font-bold flex items-center gap-1">
                  <span className={status === 'XI' ? 'text-green-800' : status === 'BENCH' ? 'text-blue-800' : status === 'INJURED' ? 'text-red-700' : 'opacity-60'}>{status}</span>
                  {offers.has(p.id) && <span className="bg-crimson text-white rounded px-1" title="A club has bid for him">BID</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-xs mt-1 opacity-70">Click a player for his dossier: contract renewal, loan, release and any offers. Potential is your Head Coach's read. ◆ individual training.</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RolePanel({ slotIdx, onClose }: { slotIdx: number; onClose: () => void }) {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const slot = FORMATIONS[club.tactics.formation].slots[slotIdx];
  const r = club.tactics.roles[slotIdx];
  const pid = club.tactics.lineup[slotIdx];
  const p = pid ? g.players[pid] : null;
  const instr = club.tactics.instructions?.[slotIdx] ?? null;
  const options = instructionsFor(slot.pos);
  return (
    <div className="manila p-4 pt-5 mt-6 slide-in">
      <div className="manila-tab">{slot.pos} · ROLE, DUTY & INSTRUCTION</div>
      <button className="absolute right-3 top-2 opacity-60 hover:opacity-100" onClick={onClose}><X size={16} /></button>
      <div className="font-type">{p ? `${p.firstName} ${p.lastName} (${p.position}, OVR ${p.ca})` : 'Empty slot: pick a player from the bench or reserves'}</div>
      {p && <div className="text-sm handwritten">{p.playstyle}. Natural role: {p.preferredRole}</div>}
      <div className="flex flex-wrap gap-2 mt-2">
        {ROLES_BY_POSITION[slot.pos].map((role) => (
          <button key={role} className={`btn btn-sm ${r?.role === role ? 'btn-amber' : ''}`} onClick={() => s.setRole(slotIdx, role)}>{role}{p?.preferredRole === role ? ' ★' : ''}</button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {DUTIES.map((d) => <button key={d} className={`btn btn-sm ${r?.duty === d ? 'btn-amber' : ''}`} onClick={() => s.setDuty(slotIdx, d)} title={DUTY_HINT[d]}>{d}</button>)}
      </div>
      <div className="text-xs mt-1 opacity-80">Duty: {r ? DUTY_HINT[r.duty] : 'how far forward he plays.'}</div>
      <div className="mt-3 text-sm font-bold">INSTRUCTION</div>
      <div className="flex flex-wrap gap-2 mt-1">
        <button className={`chip ${!instr ? 'on' : ''}`} onClick={() => s.setInstruction(slotIdx, null)}>None</button>
        {options.map((o) => {
          const suits = r && o.suits.includes(r.role);
          return (
            <button key={o.id} className={`chip ${instr === o.id ? 'on' : ''}`} onClick={() => s.setInstruction(slotIdx, o.id)} title={o.desc}>
              {o.label}{suits ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      <div className="text-xs mt-1 opacity-80">{instr ? INSTRUCTIONS[instr].desc : 'Hover an instruction to see what it does.'} A ✓ means it suits his role, which makes it work better.</div>
    </div>
  );
}
