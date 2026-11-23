import { GraduationCap } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useGame, useUserClub, PosTag, paRead, Stars, staffStars, StatBar, NationTag } from '../ui';
import { fullName } from '../../engine/ratings';
import { OUTFIELD_STATS, GK_STATS } from '../../types/player';
import { INTAKE_WEEKS } from '../../engine/academyEngine';

/** Quarterly 2–3 prospect dossiers (Sign / Release / Loan Out). */
export default function YouthIntakeFolder() {
  const g = useGame();
  const club = useUserClub();
  const s = useGameStore();
  const yd = staffStars(g, club, 'YOUTH_DIRECTOR');
  const next = INTAKE_WEEKS.find((w) => w >= g.season.matchweek);
  return (
    <div className="manila p-5 pt-6 mt-6">
      <div className="manila-tab">YOUTH INTAKE FOLDER</div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <GraduationCap size={18} /> Youth Director <Stars value={yd} size={13} /> · Academy level {club.facilities.youth}/5
        <span className="opacity-70">· Intakes after MW {INTAKE_WEEKS.join(', ')}{next ? ` (next: MW ${next})` : ''}</span>
      </div>
      {g.pendingYouth.length === 0 && <div className="paper p-4 mt-3 text-sm">The folder is empty. The Youth Director will drop 2–3 new prospects on your desk at the next intake.</div>}
      <div className="grid md:grid-cols-3 gap-4 mt-3">
        {g.pendingYouth.map((id, i) => {
          const p = g.players[id];
          if (!p) return null;
          const pa = paRead(g, p, club);
          const keys = p.position === 'GK' ? GK_STATS : OUTFIELD_STATS;
          return (
            <div key={id} className="paper p-3" style={{ transform: `rotate(${(i - 1) * 0.7}deg)` }}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-lg leading-5">{fullName(p)}</div>
                  <div className="text-sm flex items-center gap-2"><PosTag pos={p.position} /> Age {p.age} · <NationTag code={p.nationality} full /></div>
                  <div className="text-xs opacity-70">{p.playstyle}</div>
                </div>
                <span className="stamp stamp-green text-xl">{p.ca}</span>
              </div>
              <div className="mt-2 space-y-[2px]">{keys.map((k) => <StatBar key={k} label={k} value={p.stats[k]} />)}</div>
              <div className="mt-2 text-sm">Potential (YD read): <span className={`stamp ${pa.range && pa.range[1] >= 80 ? 'stamp-red' : 'stamp-blue'} text-base`}>{pa.range ? `${pa.range[0]}–${pa.range[1]}` : '?'}</span></div>
              <div className="handwritten text-sm">{p.traits.join(', ')}</div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button className="btn btn-green btn-sm" onClick={() => s.signYouth(id)}>SIGN</button>
                <button className="btn btn-sm" onClick={() => s.loanYouth(id)}>SIGN & LOAN OUT</button>
                <button className="btn btn-red btn-sm" onClick={() => s.releaseYouth(id)}>RELEASE</button>
              </div>
            </div>
          );
        })}
      </div>
      {g.pendingYouth.length > 0 && <div className="text-xs mt-3 opacity-70">Unsigned prospects are released at season's end. Most kids won't make it — trust your Youth Director's read (or don't).</div>}
    </div>
  );
}
