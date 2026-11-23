import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { CountryCode, GameState } from '../types/world';
import type { FormationId, TeamDials, PlayerRole, Duty, TeamTrainingFocus } from '../types/tactics';
import type { IndividualTrainingFocus } from '../types/player';
import type { FacilityKey } from '../engine/financeEngine';
import { generateWorld, SAVE_VERSION } from '../engine/worldGenerator';
import { advanceMatchweek, acceptJob, startNextSeason, warmUpEngine } from '../engine/seasonLoop';
import { createRng, type Rng } from '../engine/rng';
import { nextId } from '../engine/ids';
import { changeFormation, fillLineup } from '../engine/lineup';
import { assignScout } from '../engine/scoutingEngine';
import {
  submitBid, completeBid, listPlayer as listPlayerFn, signFreeAgent, answerIncomingBid, counterIncomingBid, answerTrade, loanOutPlayer, renewContract, releasePlayer, type BidInput,
} from '../engine/transferEngine';
import { signYouth, releaseYouth, loanOutYouth } from '../engine/academyEngine';
import { hireStaff } from '../engine/staffGenerator';
import { refreshShortlist, setScoutBrief } from '../engine/shortlistEngine';
import { upgradeFacility } from '../engine/financeEngine';
import { applyDilemmaEffects } from '../engine/moraleEngine';
import { FORMATIONS } from '../data/formations';
import type { RecoveryChoice } from '../types/world';
import type { DrillKind } from '../data/drills';
import type { InstructionId } from '../data/instructions';
import { INSTRUCTIONS } from '../data/instructions';
import { topUpFreeAgents, needsCoverage } from '../engine/freeAgentPool';
import { markWatched, startDayAfter, recoverySession, runDrill, repeatDrillPlan, answerPress, beginPrep } from '../engine/weekEngine';

export type Screen = 'MATCHDAY' | 'TACTICS' | 'TRANSFERS' | 'CLUB' | 'NEWS';

interface Toast {
  id: number;
  text: string;
  ok: boolean;
}

type Result = { ok: boolean; message: string };

interface GameStore {
  game: GameState | null;
  screen: Screen;
  dossierId: string | null;
  faxOpen: boolean;
  /** fax to show first when the machine opens (urgent paperwork) */
  faxFocusId: string | null;
  /** quick-sim in progress: no pop-ups */
  simming: boolean;
  newsOpen: boolean;
  toasts: Toast[];
  saveError: boolean;
  /** increments after each played matchweek (drives the CRT ticker) */
  tickerKey: number;
  /** score of the match being watched right now (drives the live league table; not saved) */
  liveScore: { resultId: string; hg: number; ag: number } | null;
  setLiveScore(v: { resultId: string; hg: number; ag: number } | null): void;

  setScreen(s: Screen): void;
  openDossier(id: string | null): void;
  setFaxOpen(v: boolean): void;
  openFax(id: string): void;
  setNewsOpen(v: boolean): void;
  quickSim(n: number): void;
  toast(text: string, ok?: boolean): void;
  dismissToast(id: number): void;

  newWorld(name: string, country: CountryCode): void;
  freePick(clubId: string): void;
  acceptJob(offerId: string): void;
  declineJob(offerId: string): void;
  resetCareer(): void;

  playMatchweek(): void;
  nextSeason(): void;
  markWatched(resultId: string): void;
  finishMatchday(): void;
  recovery(choice: RecoveryChoice): void;
  drill(playerId: string, drill: DrillKind): void;
  repeatDrills(): void;
  answerPress(idx: number): void;
  beginPrep(): void;
  setInstruction(slot: number, id: InstructionId | null): void;
  clearUrgentFaxes(): void;
  setScoutBrief(focus: string, country: CountryCode | 'ANY'): void;

  setFormation(f: FormationId): void;
  setDial<K extends keyof TeamDials>(k: K, v: TeamDials[K]): void;
  swapSlots(a: number, b: number): void;
  placeInSlot(slot: number, playerId: string): void;
  setRole(slot: number, role: PlayerRole): void;
  setDuty(slot: number, duty: Duty): void;
  autoPick(): void;
  toggleBench(playerId: string): void;
  setTrainingFocus(f: TeamTrainingFocus): void;
  toggleTrainingTag(playerId: string): void;
  setIndividualFocus(playerId: string, f: IndividualTrainingFocus): void;

  scout(playerId: string): void;
  bid(input: BidInput): void;
  finalizeBid(bidId: string, acceptCounter: boolean, wage?: number, years?: number): void;
  signFree(playerId: string, wage: number, years: number): void;
  answerIncoming(bidId: string, accept: boolean): void;
  counterIncoming(bidId: string, ask: number): void;
  answerTrade(faxId: string, accept: boolean): void;
  loanOut(playerId: string): void;
  listPlayer(playerId: string, kind: 'TRANSFER' | 'LOAN' | null, ask?: number): void;
  renew(playerId: string, wage: number, years: number): void;
  release(playerId: string): void;

  signYouth(id: string): void;
  releaseYouth(id: string): void;
  loanYouth(id: string): void;

  hire(staffId: string): void;
  upgrade(key: FacilityKey): void;

  markFaxRead(id: string): void;
  resolveFax(id: string): void;
  resolveDilemma(optionIdx: number): void;
}

/** localStorage wrapper that never throws (quota, private mode, etc.). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
      if (useGameStore.getState().saveError) useGameStore.setState({ saveError: false });
    } catch {
      useGameStore.setState({ saveError: true });
    }
  },
  removeItem: (k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

let toastSeq = 1;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      /** Clone → mutate with the pure engine → commit. Returns engine result. */
      const mutate = (fn: (g: GameState, rng: Rng) => Result | void, silent = false): Result | void => {
        const cur = get().game;
        if (!cur) return;
        const g = structuredClone(cur);
        const rng = createRng(g.rngState);
        const open = new Set(g.faxes.filter((f) => !f.resolved).map((f) => f.id));
        const res = fn(g, rng);
        g.rngState = rng.state;
        // anything you just dealt with is, by definition, read
        for (const f of g.faxes) if (f.resolved && open.has(f.id)) f.read = true;
        set({ game: g });
        if (res && !silent) get().toast(res.message, res.ok);
        return res;
      };
      const userClubOf = (g: GameState) => (g.manager.clubId ? g.clubs[g.manager.clubId] : null);

      return {
        game: null,
        screen: 'MATCHDAY',
        dossierId: null,
        faxOpen: false,
        faxFocusId: null,
        simming: false,
        newsOpen: false,
        toasts: [],
        saveError: false,
        tickerKey: 0,
        liveScore: null,
        setLiveScore: (v) => set({ liveScore: v }),

        setScreen: (s) => set({ screen: s }),
        openDossier: (id) => set({ dossierId: id }),
        setFaxOpen: (v) => set({ faxOpen: v, faxFocusId: v ? get().faxFocusId : null }),
        openFax: (id) => set({ faxOpen: true, faxFocusId: id }),
        setNewsOpen: (v) => set({ newsOpen: v }),
        quickSim: (n) => {
          if (get().simming) return;
          set({ simming: true });
          let i = 0;
          const step = () => {
            const st = get();
            const g = st.game;
            if (i >= n || !g || g.status !== 'PLAYING' || g.season.matchweek > 30) { set({ simming: false }); return; }
            st.playMatchweek();
            get().finishMatchday();
            i++;
            const after = get().game;
            // stop early when something needs the manager
            if (after && (after.urgentFaxIds.length > 0 || after.dilemma)) { set({ simming: false }); return; }
            setTimeout(step, 40);
          };
          step();
        },
        toast: (text, ok = true) => {
          const id = toastSeq++;
          set({ toasts: [...get().toasts.slice(-3), { id, text, ok }] });
          setTimeout(() => get().dismissToast(id), 3800);
        },
        dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

        newWorld: (name, country) => {
          const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
          const g = generateWorld(name, country, seed);
          warmUpEngine(g);
          set({ game: g, screen: 'MATCHDAY' });
        },
        freePick: (clubId) => {
          mutate((g) => {
            const offer = { id: nextId(g, 'j'), clubId, reason: 'Free pick', expiresWeek: 99, isLifeline: false };
            g.jobOffers.push(offer);
            return acceptJob(g, offer.id);
          });
        },
        acceptJob: (offerId) => { mutate((g) => acceptJob(g, offerId)); },
        declineJob: (offerId) => {
          mutate((g) => {
            g.jobOffers = g.jobOffers.filter((o) => o.id !== offerId);
            for (const f of g.faxes) if (f.jobOfferId === offerId) f.resolved = true;
            return { ok: true, message: 'Offer declined.' };
          });
        },
        resetCareer: () => set({ game: null, screen: 'MATCHDAY', dossierId: null, faxOpen: false }),

        playMatchweek: () => {
          const cur = get().game;
          if (!cur || cur.phase === 'MATCHDAY') return;
          const g = structuredClone(cur);
          if (g.phase === 'DAY_AFTER') {
            const rng = createRng(g.rngState);
            beginPrep(g, rng);
            g.rngState = rng.state;
          }
          advanceMatchweek(g);
          set({ game: g, tickerKey: get().tickerKey + 1, screen: 'MATCHDAY' });
        },
        markWatched: (resultId) => mutate((g) => { markWatched(g, resultId); }, true),
        finishMatchday: () => mutate((g, rng) => { if (g.phase === 'MATCHDAY') startDayAfter(g, rng); }, true),
        recovery: (choice) => { mutate((g, rng) => recoverySession(g, rng, choice)); },
        drill: (playerId, d) => { mutate((g, rng) => runDrill(g, rng, playerId, d)); },
        repeatDrills: () => { mutate((g, rng) => repeatDrillPlan(g, rng)); },
        answerPress: (idx) => { mutate((g) => answerPress(g, idx)); },
        beginPrep: () => mutate((g, rng) => { beginPrep(g, rng); }, true),
        setInstruction: (slot, id) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const arr = [...(c.tactics.instructions ?? [])];
          while (arr.length < 11) arr.push(null);
          arr[slot] = id;
          c.tactics.instructions = arr;
          return id ? { ok: true, message: `Instruction: ${INSTRUCTIONS[id].label}.` } : undefined;
        }),
        setScoutBrief: (focus, country) => { mutate((g) => setScoutBrief(g, focus, country)); },
        clearUrgentFaxes: () => mutate((g) => { g.urgentFaxIds = []; }, true),
        nextSeason: () => {
          const cur = get().game;
          if (!cur) return;
          const g = structuredClone(cur);
          startNextSeason(g);
          set({ game: g, tickerKey: 0, screen: 'MATCHDAY' });
        },

        setFormation: (f) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          changeFormation(c, f);
          return { ok: true, message: `Formation set to ${f}. Familiarity will rebuild over 3–5 matches.` };
        }),
        setDial: (k, v) => mutate((g) => {
          const c = userClubOf(g);
          if (!c || c.tactics.dials[k] === v) return;
          c.tactics.dials = { ...c.tactics.dials, [k]: v };
        }),
        swapSlots: (a, b) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const l = [...c.tactics.lineup];
          while (l.length < 11) l.push(null);
          [l[a], l[b]] = [l[b], l[a]];
          c.tactics.lineup = l;
        }),
        placeInSlot: (slot, playerId) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const inj = g.players[playerId];
          if (inj && inj.injuryWeeks > 0) {
            return { ok: false, message: `${inj.firstName} ${inj.lastName} is injured (${inj.injury?.name ?? 'injury'}, ${inj.injuryWeeks} wk) and can't start.` };
          }
          const l = [...c.tactics.lineup];
          while (l.length < 11) l.push(null);
          const existing = l.indexOf(playerId);
          const prev = l[slot];
          if (existing >= 0) l[existing] = prev;
          l[slot] = playerId;
          c.tactics.lineup = l;
          c.tactics.bench = c.tactics.bench.filter((id) => id !== playerId);
          if (prev && existing < 0 && c.tactics.bench.length < 7) c.tactics.bench.push(prev);
        }),
        setRole: (slot, role) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const r = [...c.tactics.roles];
          r[slot] = { ...r[slot], role };
          c.tactics.roles = r;
        }),
        setDuty: (slot, duty) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const r = [...c.tactics.roles];
          r[slot] = { ...r[slot], duty };
          c.tactics.roles = r;
        }),
        autoPick: () => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const sel = fillLineup(g, c, c.tactics.formation);
          c.tactics.lineup = sel.lineup;
          c.tactics.bench = sel.bench;
          return { ok: true, message: 'Assistant picked the strongest fit XI.' };
        }),
        toggleBench: (playerId) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          if (c.tactics.bench.includes(playerId)) c.tactics.bench = c.tactics.bench.filter((x) => x !== playerId);
          else {
            if ((g.players[playerId]?.injuryWeeks ?? 0) > 0) return { ok: false, message: 'Injured players can\'t be named on the bench.' };
            if (c.tactics.bench.length >= 7) return { ok: false, message: 'Bench is full (7).' };
            c.tactics.lineup = c.tactics.lineup.map((x) => (x === playerId ? null : x));
            c.tactics.bench = [...c.tactics.bench, playerId];
          }
        }),
        setTrainingFocus: (f) => mutate((g) => {
          const c = userClubOf(g);
          if (c) c.tactics.trainingFocus = f;
        }),
        toggleTrainingTag: (playerId) => mutate((g) => {
          const c = userClubOf(g);
          if (!c) return;
          const t = c.tactics.trainingTags;
          if (t.includes(playerId)) c.tactics.trainingTags = t.filter((x) => x !== playerId);
          else if (t.length >= 3) return { ok: false, message: 'Max 3 individual training tags.' };
          else c.tactics.trainingTags = [...t, playerId];
        }),
        setIndividualFocus: (playerId, f) => mutate((g) => {
          const p = g.players[playerId];
          const c = userClubOf(g);
          if (!p || !c) return;
          p.trainingFocus = f;
          if (f !== 'NONE' && !c.tactics.trainingTags.includes(playerId)) {
            if (c.tactics.trainingTags.length >= 3) return { ok: false, message: 'Max 3 tagged players — untag someone first.' };
            c.tactics.trainingTags = [...c.tactics.trainingTags, playerId];
          }
        }),

        scout: (playerId) => { mutate((g) => (g.manager.clubId ? assignScout(g, g.manager.clubId, playerId) : undefined)); },
        bid: (input) => { mutate((g) => (g.manager.clubId ? submitBid(g, g.manager.clubId, input) : undefined)); },
        finalizeBid: (bidId, acceptCounter, wage, years) => { mutate((g) => completeBid(g, bidId, acceptCounter, wage, years)); },
        signFree: (playerId, wage, years) => { mutate((g) => (g.manager.clubId ? signFreeAgent(g, g.manager.clubId, playerId, wage, years) : undefined)); },
        answerIncoming: (bidId, accept) => { mutate((g) => answerIncomingBid(g, bidId, accept)); },
        counterIncoming: (bidId, ask) => { mutate((g) => counterIncomingBid(g, bidId, ask)); },
        answerTrade: (faxId, accept) => { mutate((g) => answerTrade(g, faxId, accept)); },
        listPlayer: (playerId, kind, ask) => { mutate((g) => (g.manager.clubId ? listPlayerFn(g, g.manager.clubId, playerId, kind, ask) : undefined)); },
        loanOut: (playerId) => { mutate((g, rng) => (g.manager.clubId ? loanOutPlayer(g, rng, g.manager.clubId, playerId) : undefined)); },
        renew: (playerId, wage, years) => { mutate((g) => renewContract(g, playerId, wage, years)); },
        release: (playerId) => { mutate((g) => releasePlayer(g, playerId)); },

        signYouth: (id) => { mutate((g) => (g.manager.clubId ? signYouth(g, g.manager.clubId, id) : undefined)); },
        releaseYouth: (id) => { mutate((g) => releaseYouth(g, id)); },
        loanYouth: (id) => { mutate((g, rng) => (g.manager.clubId ? loanOutYouth(g, rng, g.manager.clubId, id) : undefined)); },

        hire: (staffId) => {
          mutate((g, rng) => {
            if (!g.manager.clubId) return;
            const role = g.staff[staffId]?.role;
            const res = hireStaff(g, g.manager.clubId, staffId);
            if (res.ok && role === 'CHIEF_SCOUT') refreshShortlist(g, rng, true);
            return res;
          });
        },
        upgrade: (key) => { mutate((g) => { const c = userClubOf(g); return c ? upgradeFacility(c, key) : undefined; }); },

        markFaxRead: (id) => mutate((g) => {
          const f = g.faxes.find((x) => x.id === id);
          if (f) f.read = true;
        }, true),
        resolveFax: (id) => mutate((g) => {
          const f = g.faxes.find((x) => x.id === id);
          if (f) { f.read = true; f.resolved = true; }
        }, true),
        resolveDilemma: (idx) => mutate((g) => {
          const c = userClubOf(g);
          const d = g.dilemma;
          if (!c || !d) return;
          const opt = d.options[idx];
          applyDilemmaEffects(g, c, opt.effects);
          g.dilemma = null;
          for (const f of g.faxes) if (f.kind === 'DILEMMA') f.resolved = true;
          return { ok: true, message: `${d.title}: ${opt.label}.` };
        }),
      };
    },
    {
      name: 'retro-desk-fc-save',
      version: SAVE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ game: s.game }),
      onRehydrateStorage: () => (state) => {
        if (state?.game) {
          setTimeout(() => {
            warmUpEngine(state.game as GameState);
            // saves made before the free-agent quotas existed get their pool restocked on opening
            const cur = useGameStore.getState().game;
            if (cur && needsCoverage(cur)) { const g = structuredClone(cur); topUpFreeAgents(g); useGameStore.setState({ game: g }); }
          }, 0);
        }
      },
      migrate: () => ({ game: null }),
      merge: (persisted, current) => {
        const p = persisted as { game?: GameState | null } | undefined;
        const game = p?.game && p.game.saveVersion === SAVE_VERSION ? p.game : null;
        return { ...current, game };
      },
    },
  ),
);

export function slotCount(g: GameState): number {
  const c = g.manager.clubId ? g.clubs[g.manager.clubId] : null;
  return c ? FORMATIONS[c.tactics.formation].slots.length : 11;
}
