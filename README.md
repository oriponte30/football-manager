# Retro Desk FC — The 1990s Manager's Desk

A fast, statistically honest football management sim wrapped in a 1990s
manager's-desk aesthetic: Teletext/CRT monitors for tables and live tickers,
manila dossiers and thermal faxes for players, scouts and job offers, and a
magnetic tactics board. One turn = one matchweek; a full 30-week season plays
in a couple of minutes of clicking.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # match-engine sanity + full season/rollover tests
npm run typecheck  # tsc --noEmit (strict)
```

Saves go to `localStorage` automatically after every action (the disk icon in
the header turns red if the browser refuses the write).

## How to play

1. **Pick a country** (England, Spain, Italy, Germany, France) and request job offers.
2. **Choose 1 of 3 faxed offers** from the five balanced Tier 3 archetypes
   (Fallen Giant, Tiny Underdog, Youth Gamble, Volatile Owner, Cult Club), or open
   the tucked-away *Free Pick* to take any club.
3. **Tactics & Squad (2):** formation, the four Team Dials, per-slot Role + Duty,
   click-to-swap or drag magnets, bench, team training focus and up to 3 tagged
   players for individual focus.
4. **Transfers & Scouting (3):** search the market, send the scout (1★ faxes are
   messy ranges, 5★ are crisp), fax a bid (optionally including a player, or as a
   loan), then sign the contract from the reply fax next turn. Free agents sign
   instantly. Quarterly youth intakes land in the Youth Intake folder.
5. **Club & Finances (4):** bank, wage bill, cash flow, facility upgrades,
   staff hiring, board confidence, fan interest and your career record.
6. **Matchday (1):** scouting preview, **PLAY MATCHWEEK** (or SIM ×5), live CRT
   ticker, diagnostic xG/xA/xGC post-match analysis, tables, cup and European bracket.
7. **World News (5):** the back page of a 1990s broadsheet, localised per nation
   (*The Sunday Pitch*, *El Balón Diario*, *La Gazzetta del Campo*, *Der Anstoß*,
   *Le Quotidien Foot*). Giant lead headline, two columns of briefs, a red
   **MY CLUB** stamp on your stories and a *Full Paper / My Club* filter.

Keyboard: `1`–`5` switch screens, `F` opens the fax machine.

## Architecture

```
src/engine/      pure TypeScript simulation (zero React imports)
src/store/       Zustand store: clone → run engine → commit, persisted to localStorage
src/components/  React UI (desk shell, CRT monitor, screens, dossiers, faxes)
src/types/       shared domain types
src/data/        name pools, 30 nationalities, playstyles, injuries, formations, archetypes
```

* **Flat, normalised state.** `players`, `clubs`, `staff`, `leagues` are
  `Record<string, …>` lookups; no nested `.find()` loops inside the sim.
* **Active vs shadow countries.** Only the active nation's three tiers (48
  clubs) are simulated match-by-match, plus its domestic cup and the European
  Cup. The other four Tier 1s are **shadow leagues** resolved in one Poisson
  pass at season end (`shadowLeagueEngine.ts`).
* **Performance.** A matchweek (24 league games + cup + European ties + weekly
  progression for ~1,100 players) runs in roughly 10–20 ms; the time of the last
  sim is shown on the Matchday screen. The engine JIT is warmed on world
  generation and save load.

### Match engine (`src/engine/matchEngine.ts`)

~100 discrete possessions per match:

1. **Midfield battle** — weighted Passing/Dribbling/Physical control vs
   Defending/Physical/Pace resistance, modified by dials, roles, duties,
   familiarity, live fitness, morale and home advantage → who owns the
   possession (this *is* the possession %).
2. **Chance creation** — a creator is picked by role/focus weights and tested
   against the defensive block; success produces a shot type with an xG
   (0.03 long shot … 0.48 one-on-one, 0.76 penalty) and the creator is credited
   that exact xA.
3. **Shot resolution** — finishing (Shooting + form + Clutch/Poacher…) vs the
   keeper's Reflexes/Positioning/Handling → goal, saved, blocked or off target.

Calibration (`npm run sim:calibrate`, neutral venue, 300 matches each):

| Match-up | Win | Draw | Loss | Goals/game |
|---|---|---|---|---|
| 85 v 55 | ~95% | ~4% | ~1% | 4.3–0.5 |
| 75 v 62 | ~67% | ~19% | ~14% | 2.4–0.9 |
| 70 v 70 | ~38% | ~23% | ~39% | 1.5–1.5 |
| 58 v 80 | ~4% | ~10% | ~86% | 0.7–3.3 |

### Phase 2 hooks (Key-Moments gameplay — not playable yet)

`matchCore()` is a generator that **yields** a `KeyMomentEvent` for each
high-leverage chance (xG ≥ 0.20; one-on-ones, counters, crosses, set pieces;
max 5 per match) and accepts a `KeyMomentOutcome` (`GOAL | SAVED | MISSED |
CLEARED`) back.

* `MatchSimulationMode = 'AUTO_SIM' | 'KEY_MOMENTS_HOOK'`
* `simulateMatch(home, away, { mode, onKeyMoment }, rng)` — sync resolver;
  returning `undefined` falls back to the probabilistic outcome.
* `simulateMatchAsync(home, away, ctx, rng, resolver)` — awaits a Promise, ready
  for a 10–15 s 2D mini-game canvas.
* Every result carries the ordered `MatchEvent[]` (with flagged key moments)
  and `keyMoments[]`. Phase 1 runs `AUTO_SIM` and shows the highlights (★) in
  the CRT ticker.

## Systems at a glance

| System | Where |
|---|---|
| World, 5 nations, 3 job offers, Golden Ticket (2.5%) | `worldGenerator.ts`, `playerGenerator.ts` |
| Career curves (Standard / Late Bloomer / Early Peaker / Ageless / Flop) | `progressionEngine.ts` |
| Weekly XP = AgeCurve × Minutes × Rating × Headroom × Coach★ × Morale | `progressionEngine.ts` |
| Offset perceived PA (no midpoint exploit), fax clarity by scout ★ | `scoutingEngine.ts` |
| Valuation, bids/counters, strict loan AI, rare trades, release clauses | `transferEngine.ts` |
| Gates, TV money, wage caps (Spain), facility costs (Germany), red balance | `financeEngine.ts` |
| Quarterly youth intake + superstar roll | `academyEngine.ts` |
| Atmosphere, 5-level morale, dressing-room dilemmas, fan interest | `moraleEngine.ts` |
| Fixtures, cup, European Cup, board/sacking, job offers, rollover | `seasonLoop.ts` |
| Staff 1.0–5.0★ with hidden ceilings and organic drift | `staffGenerator.ts` |
| Injuries: 4 tiers (Minor 55% / Moderate 30% / Serious 12% / Severe 3%), match + rare training risk scaled by fatigue, High Press, low Physical, Injury Prone / Glass Ankles; Physio cuts odds slightly and recovery by up to 25% at 5★ | `injuryEngine.ts`, `data/injuries.ts` |
| World News: record & blockbuster transfers (all 5 nations), trophies, Tier 3 giant-killings, my-club stories (purple patch, serious injury, wonderkid debut, bigger clubs circling); archive capped at 60 | `newsEngine.ts`, `components/news/NewsTab.tsx` |
| 30 nationalities with native name pools; senior squads ~55–65% domestic, youth ~70%; foreign imports weighted to big football nations with league-specific ties | `data/nationalities.ts` |
| Unique worlds: fresh seed per career, randomised playstyles (stat skew, natural role, fitting traits), squad age/depth profiles, AI tactical identities (Catenaccio, Gegenpress, Long Ball…) and strength/reputation rolled within tier bounds | `data/playstyles.ts`, `worldGenerator.ts` |
| AI ↔ AI transfer market across all five countries during windows | `transferEngine.ts` (`aiWorldTransfers`) |

## Play online (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes the game on every push to `main`.

1. Push/upload the repo to GitHub (include `.github/workflows/deploy.yml` and `package-lock.json`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open the **Actions** tab and wait for *Deploy to GitHub Pages* to go green
   (re-run it once if it started before step 2).
4. Play at `https://<your-user>.github.io/<repo-name>/`.

Saves live in each player's own browser (localStorage), so no server is needed.

## Dev scripts

* `npm run sim:season -- ENG 42` — headless 3-season career (prints tables, timings, save size)
* `npm run sim:balance` — sacking rate and finishing positions per archetype on autopilot
* `npm run sim:calibrate` — match-engine win/draw/loss table
* `npm run sim:features` — nationality mix, injury tiers, tactical identities and a sample of the newspaper
