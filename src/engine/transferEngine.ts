/**
 * Valuation, the 3 signing pipelines (free agents, loans, transfers), rare
 * player trades, release clauses and contract pressure.
 */
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { TransferBid, FaxMessage, TradeProposal } from '../types/transfers';
import { POSITION_GROUP } from '../data/formations';
import { COUNTRIES } from '../data/countries';
import { clamp, hash01, type Rng } from './rng';
import { fullName, moraleLevel } from './ratings';
import { nextId } from './ids';
import { wageFor } from './playerGenerator';
import { canAffordWage, credit, fmtMoney } from './financeEngine';
import { newsTransfer } from './newsEngine';

const POS_VALUE: Record<string, number> = { GK: 0.8, CB: 0.95, LB: 0.9, RB: 0.9, CDM: 0.95, CM: 1, CAM: 1.1, LW: 1.08, RW: 1.08, ST: 1.18 };

/** Player valuation from CA, (market-estimated) PA, age, position and contract length. */
export function valuePlayer(p: Player, yearsOverride?: number): number {
  const years = yearsOverride ?? p.contract.yearsLeft;
  const marketPA = p.truePA + (hash01(p.paSeed, 'market') - 0.5) * 10;
  let v = 25_000 * Math.pow(1.13, p.ca - 45);
  if (p.age <= 23) v += 25_000 * Math.pow(1.13, Math.max(p.ca, marketPA) - 45) * 0.32 * ((24 - p.age) / 7);
  if (p.age > 29) v *= Math.max(0.18, 1 - 0.13 * (p.age - 29));
  v *= POS_VALUE[p.position] ?? 1;
  v *= years <= 0 ? 0.25 : 0.55 + 0.15 * Math.min(4, years);
  const round = v >= 1e6 ? 50_000 : v >= 1e5 ? 5_000 : 1_000;
  return Math.max(5_000, Math.round(v / round) * round);
}

export function isForeignSale(seller: Club, buyer: Club): boolean {
  return seller.country !== buyer.country;
}

export function askingPrice(g: GameState, p: Player, seller: Club, buyer: Club): number {
  let v = valuePlayer(p);
  const squad = seller.playerIds.map((id) => g.players[id]).filter(Boolean).sort((a, b) => b.ca - a.ca);
  const rank = squad.findIndex((x) => x.id === p.id);
  if (rank >= 0 && rank < 3) v *= 1.45;
  else if (rank >= 0 && rank < 11) v *= 1.15;
  if (isForeignSale(seller, buyer)) v *= COUNTRIES[seller.country].foreignFeeMult;
  return Math.round(v / 5000) * 5000;
}

export function demandedWage(p: Player, buyer: Club): number {
  const market = wageFor(p.ca, buyer.tier, buyer.country, p.position);
  return Math.round(Math.max(market, p.contract.wage * 1.08) / 10) * 10;
}

/** Contract stage: checked against Club Reputation + Wage + 1–5 yr length. */
export function playerWillingness(g: GameState, p: Player, buyer: Club, wage: number, years: number): { ok: boolean; reason: string } {
  const current = p.clubId ? g.clubs[p.clubId] : null;
  const curRep = current ? current.reputation : 10;
  const demand = demandedWage(p, buyer);
  const ambition = p.ca >= 70 ? 1.15 : 1;
  const repGap = curRep - buyer.reputation;
  let need = demand * ambition * (repGap > 0 ? 1 + repGap / 60 : 1);
  if (p.age >= 30 && years >= 3) need *= 0.92;
  if (p.age <= 23 && years >= 4) need *= 1.05;
  if (years > 5 || years < 1) return { ok: false, reason: 'Contract length must be 1–5 years.' };
  if (p.age >= 33 && years > 2) return { ok: false, reason: 'At his age he only wants a short deal.' };
  if (repGap > 40 && wage < need * 1.6) return { ok: false, reason: `${p.lastName} isn't interested in stepping down to a club of your stature.` };
  if (wage < need) return { ok: false, reason: `His agent wants at least ${fmtMoney(Math.round(need / 10) * 10)}/wk.` };
  return { ok: true, reason: 'Terms agreed.' };
}

export function windowOpen(g: GameState): boolean {
  return g.season.window !== 'CLOSED';
}

export function windowFor(mw: number): 'SUMMER' | 'WINTER' | 'CLOSED' {
  if (mw <= 4) return 'SUMMER';
  if (mw >= 15 && mw <= 18) return 'WINTER';
  return 'CLOSED';
}

export function fax(g: GameState, f: Omit<FaxMessage, 'id' | 'season' | 'week' | 'read' | 'resolved'> & { resolved?: boolean }): FaxMessage {
  const m: FaxMessage = { id: nextId(g, 'f'), season: g.season.year, week: g.season.matchweek, read: false, resolved: f.resolved ?? false, ...f };
  g.faxes.unshift(m);
  if (g.faxes.length > 70) {
    const keep = g.faxes.filter((x, i) => i < 50 || !x.resolved);
    g.faxes = keep.slice(0, 80);
  }
  return m;
}

/* ------------------------- Bids (user → AI) ------------------------- */

export interface BidInput {
  playerId: string;
  fee: number;
  wage: number;
  years: number;
  includePlayerId: string | null;
  type: 'TRANSFER' | 'LOAN';
  loanWageShare: number;
}

export function submitBid(g: GameState, buyerId: string, input: BidInput): { ok: boolean; message: string } {
  const p = g.players[input.playerId];
  const buyer = g.clubs[buyerId];
  if (!p) return { ok: false, message: 'Unknown player.' };
  if (p.clubId === buyerId) return { ok: false, message: 'He already plays for you.' };
  if (buyer.finances.bank < 0) return { ok: false, message: 'IN THE RED: the bank has frozen all new signings.' };
  if (!p.clubId) return { ok: false, message: 'Free agent: offer a contract directly.' };
  if (!windowOpen(g)) return { ok: false, message: 'The transfer window is closed.' };
  if (p.loanFromClubId) return { ok: false, message: 'He is on loan there and cannot be sold.' };
  if (g.bids.some((b) => b.playerId === p.id && b.direction === 'OUTGOING' && (b.status === 'PENDING' || b.status === 'COUNTERED' || b.status === 'ACCEPTED'))) {
    return { ok: false, message: 'You already have a live bid for this player.' };
  }
  if (input.type === 'TRANSFER' && input.fee > buyer.finances.bank) return { ok: false, message: 'Not enough in the bank to cover that fee.' };
  const bid: TransferBid = {
    id: nextId(g, 'b'), type: input.type, direction: 'OUTGOING', playerId: p.id, buyerClubId: buyerId, sellerClubId: p.clubId,
    fee: input.type === 'LOAN' ? 0 : Math.max(0, Math.round(input.fee)), wage: Math.round(input.wage), years: input.type === 'LOAN' ? 1 : input.years,
    includePlayerId: input.includePlayerId, loanWageShare: clamp(input.loanWageShare, 0, 1), status: 'PENDING', counterFee: null,
    resolveWeek: g.season.matchweek, season: g.season.year, note: '',
  };
  g.bids.push(bid);
  return { ok: true, message: `Bid faxed to ${g.clubs[p.clubId].name}. Expect a reply next turn.` };
}

function positionalNeed(g: GameState, club: Club, p: Player): boolean {
  const grp = POSITION_GROUP[p.position];
  const count = club.playerIds.filter((id) => g.players[id] && POSITION_GROUP[g.players[id].position] === grp).length;
  const target = grp === 'GK' ? 2 : grp === 'DEF' ? 8 : grp === 'MID' ? 6 : 6;
  return count < target;
}

/** AI response to a user bid (resolved at the next turn). */
export function resolveOutgoingBid(g: GameState, rng: Rng, bid: TransferBid): void {
  const p = g.players[bid.playerId];
  const seller = bid.sellerClubId ? g.clubs[bid.sellerClubId] : null;
  const buyer = g.clubs[bid.buyerClubId];
  if (!p || !seller || p.clubId !== seller.id) {
    bid.status = 'COLLAPSED';
    fax(g, { kind: 'BID_RESPONSE', from: 'Transfer Desk', title: 'Deal collapsed', body: 'The player is no longer at that club.', bidId: bid.id, resolved: true });
    return;
  }
  if (bid.type === 'LOAN') return resolveLoan(g, rng, bid, p, seller, buyer);

  const asking = askingPrice(g, p, seller, buyer);
  let effectiveFee = bid.fee;
  let tradeNote = '';
  if (bid.includePlayerId) {
    const inc = g.players[bid.includePlayerId];
    const ok = inc && inc.clubId === buyer.id && positionalNeed(g, seller, inc) && inc.contract.wage <= p.contract.wage * 1.3 && seller.reputation >= buyer.reputation - 15 && moraleLevel(inc.moraleValue) >= 1;
    if (ok) {
      effectiveFee += valuePlayer(inc) * 0.8;
      tradeNote = ` They will take ${fullName(inc)} as part of the deal.`;
    } else {
      bid.status = 'REJECTED';
      bid.note = 'Trade component rejected';
      fax(g, {
        kind: 'BID_RESPONSE', from: seller.name, title: `REJECTED: ${fullName(p)}`, playerId: p.id, bidId: bid.id, resolved: true,
        body: `We have no use for ${inc ? fullName(inc) : 'that player'} — positional need, wages or the player's willingness don't line up. Cash only, please.`,
      });
      return;
    }
  }
  const clause = p.contract.releaseClause;
  if ((clause !== null && bid.fee >= clause) || effectiveFee >= asking) {
    bid.status = 'ACCEPTED';
    bid.note = tradeNote;
  } else if (effectiveFee >= asking * 0.78 && rng.chance(0.85)) {
    bid.status = 'COUNTERED';
    bid.counterFee = Math.round((asking - (effectiveFee - bid.fee)) / 5000) * 5000;
  } else {
    bid.status = 'REJECTED';
  }
  if (bid.status === 'ACCEPTED') {
    const will = playerWillingness(g, p, buyer, bid.wage, bid.years);
    fax(g, {
      kind: 'BID_RESPONSE', from: seller.name, title: `ACCEPTED: ${fullName(p)}`, playerId: p.id, bidId: bid.id, resolved: false,
      body: `We accept your offer of ${fmtMoney(bid.fee)}.${tradeNote}\nPERSONAL TERMS: ${will.ok ? 'His agent confirms the player will sign.' : will.reason}\nComplete the paperwork to finalise.`,
    });
  } else if (bid.status === 'COUNTERED') {
    fax(g, {
      kind: 'BID_RESPONSE', from: seller.name, title: `COUNTER-OFFER: ${fullName(p)}`, playerId: p.id, bidId: bid.id, resolved: false,
      body: `Your ${fmtMoney(bid.fee)} is too low. We would do business at ${fmtMoney(bid.counterFee ?? 0)}.`,
    });
  } else {
    fax(g, {
      kind: 'BID_RESPONSE', from: seller.name, title: `REJECTED: ${fullName(p)}`, playerId: p.id, bidId: bid.id, resolved: true,
      body: `Your offer of ${fmtMoney(bid.fee)} is nowhere near our valuation. ${rng.chance(0.5) ? 'Do not insult us.' : 'Come back with a serious bid.'}`,
    });
  }
}

/** Strict loan AI: ~70–85% of ambitious bids are rejected. */
function resolveLoan(g: GameState, rng: Rng, bid: TransferBid, p: Player, lender: Club, borrower: Club): void {
  const squad = lender.playerIds.map((id) => g.players[id]).filter(Boolean).sort((a, b) => b.ca - a.ca);
  const rank = squad.findIndex((x) => x.id === p.id);
  const tierGap = Math.abs(lender.tier - borrower.tier) + (lender.country !== borrower.country ? 1 : 0);
  const borrowerAvg = avgCa(g, borrower);
  const ambitious = p.ca > borrowerAvg + 6;
  let reason = '';
  if (rank >= 0 && rank < 16) reason = 'He is part of our regular rotation.';
  else if (tierGap > 1) reason = 'The level gap is too wide for his development.';
  else if (bid.loanWageShare < 0.5) reason = 'You must cover at least half of his wages.';
  else if (ambitious && rng.chance(0.78)) reason = 'He would not get the right kind of football with you.';
  else if (!ambitious && rng.chance(0.3)) reason = 'We would rather keep him for now.';
  if (reason) {
    bid.status = 'REJECTED';
    fax(g, { kind: 'LOAN_RESPONSE', from: lender.name, title: `LOAN REJECTED: ${fullName(p)}`, body: reason, playerId: p.id, bidId: bid.id, resolved: true });
    return;
  }
  bid.status = 'ACCEPTED';
  fax(g, {
    kind: 'LOAN_RESPONSE', from: lender.name, title: `LOAN AGREED: ${fullName(p)}`, playerId: p.id, bidId: bid.id, resolved: false,
    body: `Season-long loan approved. You cover ${Math.round(bid.loanWageShare * 100)}% of his ${fmtMoney(p.contract.wage)}/wk. Confirm to bring him in.`,
  });
}

export function avgCa(g: GameState, club: Club): number {
  const s = club.playerIds.map((id) => g.players[id]?.ca ?? 0).sort((a, b) => b - a).slice(0, 16);
  return s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
}

function detachFromClub(g: GameState, p: Player): void {
  if (!p.clubId) {
    g.freeAgentIds = g.freeAgentIds.filter((id) => id !== p.id);
    return;
  }
  const c = g.clubs[p.clubId];
  if (!c) return;
  c.playerIds = c.playerIds.filter((id) => id !== p.id);
  c.tactics.lineup = c.tactics.lineup.map((id) => (id === p.id ? null : id));
  c.tactics.bench = c.tactics.bench.filter((id) => id !== p.id);
  c.tactics.trainingTags = c.tactics.trainingTags.filter((id) => id !== p.id);
}

export function movePlayer(g: GameState, p: Player, toClubId: string | null): void {
  detachFromClub(g, p);
  p.clubId = toClubId;
  if (toClubId) g.clubs[toClubId].playerIds.push(p.id);
  else if (!g.freeAgentIds.includes(p.id)) g.freeAgentIds.push(p.id);
  p.trainingFocus = 'NONE';
}

/** Finalise an accepted (or countered-then-accepted) user bid. */
export function completeBid(g: GameState, bidId: string, acceptCounter = false, wageOverride?: number, yearsOverride?: number): { ok: boolean; message: string } {
  const bid = g.bids.find((b) => b.id === bidId);
  if (!bid) return { ok: false, message: 'Bid not found.' };
  if (wageOverride !== undefined && wageOverride > 0) bid.wage = Math.round(wageOverride);
  if (yearsOverride !== undefined) bid.years = yearsOverride;
  const p = g.players[bid.playerId];
  const buyer = g.clubs[bid.buyerClubId];
  const seller = bid.sellerClubId ? g.clubs[bid.sellerClubId] : null;
  if (!p || !seller || p.clubId !== seller.id) { bid.status = 'COLLAPSED'; return { ok: false, message: 'Deal collapsed: player has moved.' }; }
  if (bid.status === 'COUNTERED') {
    if (!acceptCounter) return { ok: false, message: 'Counter-offer pending.' };
    bid.fee = bid.counterFee ?? bid.fee;
    bid.status = 'ACCEPTED';
  }
  if (bid.status !== 'ACCEPTED') return { ok: false, message: 'This deal is no longer available.' };
  if (buyer.finances.bank < 0) return { ok: false, message: 'IN THE RED: signings are frozen.' };
  if (bid.type === 'TRANSFER' && buyer.finances.bank < bid.fee) return { ok: false, message: 'Not enough funds for the fee.' };

  if (bid.type === 'LOAN') {
    const cost = Math.round(p.contract.wage * bid.loanWageShare);
    const cap = canAffordWage(g, buyer, cost);
    if (!cap.ok) return { ok: false, message: cap.message };
    detachFromClub(g, p);
    p.loanFromClubId = seller.id;
    p.clubId = buyer.id;
    buyer.playerIds.push(p.id);
    p.contract = { ...p.contract, wage: cost };
    bid.status = 'COMPLETED';
    resolveFaxesFor(g, bid.id);
    return { ok: true, message: `${fullName(p)} joins on a season-long loan.` };
  }

  const will = playerWillingness(g, p, buyer, bid.wage, bid.years);
  if (!will.ok) return { ok: false, message: will.reason };
  const cap = canAffordWage(g, buyer, bid.wage);
  if (!cap.ok) return { ok: false, message: cap.message };

  buyer.finances.bank -= bid.fee;
  buyer.finances.ledger.transfers += bid.fee;
  credit(seller, bid.fee, 'sales');
  if (bid.includePlayerId) {
    const inc = g.players[bid.includePlayerId];
    if (inc && inc.clubId === buyer.id) {
      movePlayer(g, inc, seller.id);
      inc.contract.yearsLeft = Math.max(2, inc.contract.yearsLeft);
    }
  }
  movePlayer(g, p, buyer.id);
  p.contract = { wage: bid.wage, yearsLeft: bid.years, releaseClause: null };
  p.moraleValue = clamp(p.moraleValue + 15, 0, 100);
  bid.status = 'COMPLETED';
  if (bid.fee >= valuePlayer(p) * 0.6 && p.ca >= avgCa(g, buyer) + 4) buyer.fanInterest = clamp(buyer.fanInterest + 4, 0, 100);
  if (bid.type === 'TRANSFER') newsTransfer(g, null, p, seller, buyer, bid.fee);
  resolveFaxesFor(g, bid.id);
  return { ok: true, message: `${fullName(p)} signs a ${bid.years}-year deal for ${fmtMoney(bid.fee)}.` };
}

export function resolveFaxesFor(g: GameState, bidId: string): void {
  for (const f of g.faxes) if (f.bidId === bidId) f.resolved = true;
}

/* ------------------------- Free agents ------------------------- */

export function signFreeAgent(g: GameState, clubId: string, playerId: string, wage: number, years: number): { ok: boolean; message: string } {
  const p = g.players[playerId];
  const club = g.clubs[clubId];
  if (!p || p.clubId) return { ok: false, message: 'Not a free agent.' };
  if (club.finances.bank < 0) return { ok: false, message: 'IN THE RED: signings are frozen.' };
  if (club.playerIds.length >= 32) return { ok: false, message: 'Squad is full (32).' };
  const will = playerWillingness(g, p, club, wage, years);
  if (!will.ok) return { ok: false, message: will.reason };
  const cap = canAffordWage(g, club, wage);
  if (!cap.ok) return { ok: false, message: cap.message };
  movePlayer(g, p, clubId);
  p.contract = { wage, yearsLeft: years, releaseClause: null };
  return { ok: true, message: `${fullName(p)} signs on a free (${fmtMoney(wage)}/wk, ${years} yr).` };
}

/* ------------------------- Loan out own kids ------------------------- */

export function loanOutPlayer(g: GameState, rng: Rng, clubId: string, playerId: string): { ok: boolean; message: string } {
  const p = g.players[playerId];
  const parent = g.clubs[clubId];
  if (!p || p.clubId !== clubId) return { ok: false, message: 'Not your player.' };
  if (p.loanFromClubId) return { ok: false, message: 'He is already a loanee.' };
  if (p.age > 23) return { ok: false, message: 'Only players 23 and under can be loaned out.' };
  const candidates = Object.values(g.clubs).filter((c) => !c.isShadow && c.id !== clubId && c.reputation <= parent.reputation + 5 && c.playerIds.length < 30 && avgCa(g, c) <= p.ca + 8);
  if (candidates.length === 0) return { ok: false, message: 'No club wants him right now.' };
  const dest = rng.pick(candidates);
  detachFromClub(g, p);
  p.loanFromClubId = clubId;
  p.clubId = dest.id;
  dest.playerIds.push(p.id);
  return { ok: true, message: `${fullName(p)} heads to ${dest.name} on a season-long loan for minutes.` };
}

export function returnLoans(g: GameState): void {
  for (const p of Object.values(g.players)) {
    if (!p.loanFromClubId) continue;
    const parent = g.clubs[p.loanFromClubId];
    detachFromClub(g, p);
    p.clubId = parent ? parent.id : null;
    if (parent) {
      parent.playerIds.push(p.id);
      if (p.contract.wage < 200) p.contract.wage = 200;
    } else g.freeAgentIds.push(p.id);
    p.loanFromClubId = null;
  }
}

/* ------------------------- Contract renewal ------------------------- */

export function renewalDemand(g: GameState, p: Player): number {
  const club = p.clubId ? g.clubs[p.clubId] : null;
  if (!club) return p.contract.wage;
  return Math.round(Math.max(p.contract.wage * 1.12, wageFor(p.ca, club.tier, club.country, p.position)) / 10) * 10;
}

export function renewContract(g: GameState, playerId: string, wage: number, years: number): { ok: boolean; message: string } {
  const p = g.players[playerId];
  if (!p || !p.clubId) return { ok: false, message: 'Not under contract.' };
  if (p.loanFromClubId) return { ok: false, message: 'Loanees cannot be renewed.' };
  const lvl = moraleLevel(p.moraleValue);
  if (lvl <= 1) return { ok: false, message: `${p.lastName} is ${lvl === 0 ? 'furious' : 'unhappy'} and refuses to discuss a new deal. He wants out.` };
  if (years < 1 || years > 5) return { ok: false, message: 'Contracts run 1–5 years.' };
  if (p.age >= 33 && years > 2) return { ok: false, message: 'Veterans only sign 1–2 year deals.' };
  const demand = renewalDemand(g, p) * (lvl === 4 ? 0.92 : lvl === 3 ? 0.97 : 1.05);
  if (wage < demand) return { ok: false, message: `He wants at least ${fmtMoney(Math.round(demand / 10) * 10)}/wk.` };
  const club = g.clubs[p.clubId];
  const cap = canAffordWage(g, club, wage - p.contract.wage);
  if (!cap.ok) return { ok: false, message: cap.message };
  p.contract.wage = Math.round(wage);
  p.contract.yearsLeft = years;
  p.moraleValue = clamp(p.moraleValue + 8, 0, 100);
  return { ok: true, message: `${fullName(p)} commits his future: ${years} yr at ${fmtMoney(wage)}/wk.` };
}

export function releasePlayer(g: GameState, playerId: string): { ok: boolean; message: string } {
  const p = g.players[playerId];
  if (!p || !p.clubId) return { ok: false, message: 'Not under contract.' };
  const club = g.clubs[p.clubId];
  if (club.playerIds.length <= 16) return { ok: false, message: 'Squad too thin to release anyone (min 16).' };
  const payoff = p.contract.wage * 8 * Math.max(1, p.contract.yearsLeft);
  club.finances.bank -= payoff;
  club.finances.ledger.wages += payoff;
  if (p.fanFavorite) club.fanInterest = clamp(club.fanInterest - 5, 0, 100);
  movePlayer(g, p, null);
  p.contract = { wage: p.contract.wage, yearsLeft: 0, releaseClause: null };
  return { ok: true, message: `${fullName(p)} released. Pay-off: ${fmtMoney(payoff)}.` };
}

/* ------------------------- AI bids for the user's players ------------------------- */

export function aiIncomingBids(g: GameState, rng: Rng, userClubId: string): void {
  if (!windowOpen(g) || g.season.matchweek <= 2 || !rng.chance(0.3)) return;
  const user = g.clubs[userClubId];
  const squad = user.playerIds.map((id) => g.players[id]).filter((p) => p && !p.loanFromClubId);
  if (squad.length < 18) return;
  const target = rng.weighted(squad, squad.map((p) => Math.pow(Math.max(1, valuePlayer(p) / 1e5), 1.2) * (p.age <= 23 ? 1.5 : 1)));
  if (g.bids.some((b) => b.playerId === target.id && b.status === 'PENDING')) return;
  const buyers = Object.values(g.clubs).filter((c) => c.id !== userClubId && (c.tier < user.tier || c.reputation > user.reputation + 8) && c.finances.bank > valuePlayer(target));
  if (buyers.length === 0) return;
  const buyer = rng.pick(buyers);
  let fee = Math.round(valuePlayer(target) * rng.range(0.85, 1.35) * (isForeignSale(user, buyer) ? COUNTRIES[user.country].foreignFeeMult : 1) / 5000) * 5000;
  const clause = target.contract.releaseClause;
  if (clause !== null && rng.chance(0.22) && buyer.finances.bank > clause) fee = clause;
  if (clause !== null && fee >= clause) {
    // release clause triggered — poaching, no say
    buyer.finances.bank -= fee;
    credit(user, fee, 'sales');
    if (target.fanFavorite) user.fanInterest = clamp(user.fanInterest - 6, 0, 100);
    movePlayer(g, target, buyer.id);
    target.contract = { wage: Math.round(target.contract.wage * 1.6), yearsLeft: 4, releaseClause: null };
    fax(g, {
      kind: 'INCOMING_BID', from: buyer.name, title: `CLAUSE TRIGGERED: ${fullName(target)}`, playerId: target.id, resolved: true,
      body: `${buyer.name} have met the ${fmtMoney(clause)} release clause. ${fullName(target)} has left the club. Nothing could be done.`,
    });
    newsTransfer(g, rng, target, user, buyer, fee, 'CLAUSE');
    return;
  }
  const bid: TransferBid = {
    id: nextId(g, 'b'), type: 'TRANSFER', direction: 'INCOMING', playerId: target.id, buyerClubId: buyer.id, sellerClubId: userClubId,
    fee, wage: Math.round(target.contract.wage * 1.4), years: 3, includePlayerId: null, loanWageShare: 0, status: 'PENDING',
    counterFee: null, resolveWeek: g.season.matchweek + 1, season: g.season.year, note: '',
  };
  g.bids.push(bid);
  fax(g, {
    kind: 'INCOMING_BID', from: buyer.name, title: `BID RECEIVED: ${fullName(target)}`, playerId: target.id, bidId: bid.id, resolved: false,
    body: `${buyer.name} offer ${fmtMoney(fee)} for ${fullName(target)} (valued ~${fmtMoney(valuePlayer(target))}). Offer stands until next turn.`,
  });
}

export function answerIncomingBid(g: GameState, bidId: string, accept: boolean): { ok: boolean; message: string } {
  const bid = g.bids.find((b) => b.id === bidId);
  if (!bid || bid.status !== 'PENDING') return { ok: false, message: 'Offer expired.' };
  const p = g.players[bid.playerId];
  const seller = bid.sellerClubId ? g.clubs[bid.sellerClubId] : null;
  const buyer = g.clubs[bid.buyerClubId];
  resolveFaxesFor(g, bid.id);
  if (!accept || !p || !seller || p.clubId !== seller.id) {
    bid.status = 'REJECTED';
    if (p && accept === false && p.ca >= avgCa(g, seller ?? buyer) + 3) p.moraleValue = clamp(p.moraleValue - 8, 0, 100);
    return { ok: true, message: 'Offer rejected.' };
  }
  buyer.finances.bank -= bid.fee;
  credit(seller, bid.fee, 'sales');
  if (p.fanFavorite) seller.fanInterest = clamp(seller.fanInterest - 6, 0, 100);
  movePlayer(g, p, buyer.id);
  p.contract = { wage: bid.wage, yearsLeft: bid.years, releaseClause: null };
  bid.status = 'COMPLETED';
  if (bid.type === 'TRANSFER') newsTransfer(g, null, p, seller, buyer, bid.fee);
  return { ok: true, message: `${fullName(p)} sold to ${buyer.name} for ${fmtMoney(bid.fee)}.` };
}

export function expireIncomingBids(g: GameState): void {
  for (const b of g.bids) {
    if (b.direction === 'INCOMING' && b.status === 'PENDING' && b.resolveWeek < g.season.matchweek) {
      b.status = 'REJECTED';
      resolveFaxesFor(g, b.id);
    }
  }
}

/* ------------------------- Rare AI trade faxes (max 2 / season) ------------------------- */

export function maybeAiTradeFax(g: GameState, rng: Rng, userClubId: string): void {
  if (g.aiTradeFaxesThisSeason >= 2 || !windowOpen(g) || !rng.chance(0.18)) return;
  const user = g.clubs[userClubId];
  const mine = user.playerIds.map((id) => g.players[id]).filter((p) => p && !p.loanFromClubId && p.age >= 20);
  if (mine.length === 0) return;
  const wanted = rng.pick(mine);
  const partners = Object.values(g.clubs).filter((c) => !c.isShadow && c.id !== userClubId && Math.abs(c.tier - user.tier) <= 1);
  if (partners.length === 0) return;
  const partner = rng.pick(partners);
  const v = valuePlayer(wanted);
  const offer = partner.playerIds.map((id) => g.players[id]).filter((p) => p && !p.loanFromClubId && p.position !== wanted.position)
    .sort((a, b) => Math.abs(valuePlayer(a) - v) - Math.abs(valuePlayer(b) - v))[0];
  if (!offer) return;
  const trade: TradeProposal = {
    id: nextId(g, 't'), fromClubId: partner.id, offeredPlayerId: offer.id, requestedPlayerId: wanted.id,
    cashAdjustment: Math.round((v - valuePlayer(offer)) * 0.6 / 5000) * 5000,
  };
  g.aiTradeFaxesThisSeason++;
  fax(g, {
    kind: 'TRADE_PROPOSAL', from: partner.name, title: `SWAP PROPOSAL: ${wanted.lastName} ⇄ ${offer.lastName}`, trade, tradeId: trade.id, playerId: offer.id, resolved: false,
    body: `We propose a straight swap: your ${fullName(wanted)} (${wanted.position}) for our ${fullName(offer)} (${offer.position}, ${offer.age}).${trade.cashAdjustment > 0 ? ` We add ${fmtMoney(trade.cashAdjustment)}.` : trade.cashAdjustment < 0 ? ` You add ${fmtMoney(-trade.cashAdjustment)}.` : ''}`,
  });
}

export function answerTrade(g: GameState, faxId: string, accept: boolean): { ok: boolean; message: string } {
  const f = g.faxes.find((x) => x.id === faxId);
  if (!f || !f.trade || f.resolved) return { ok: false, message: 'Proposal expired.' };
  f.resolved = true;
  if (!accept) return { ok: true, message: 'Swap declined.' };
  const t = f.trade;
  const theirs = g.players[t.offeredPlayerId];
  const mine = g.players[t.requestedPlayerId];
  const partner = g.clubs[t.fromClubId];
  const userId = g.manager.clubId;
  if (!theirs || !mine || !partner || !userId || mine.clubId !== userId || theirs.clubId !== partner.id) return { ok: false, message: 'Deal fell through.' };
  const user = g.clubs[userId];
  if (t.cashAdjustment < 0 && user.finances.bank < -t.cashAdjustment) return { ok: false, message: 'Not enough cash to cover the balance.' };
  movePlayer(g, mine, partner.id);
  movePlayer(g, theirs, userId);
  user.finances.bank += t.cashAdjustment;
  partner.finances.bank -= t.cashAdjustment;
  return { ok: true, message: `Swap done: ${fullName(theirs)} arrives, ${fullName(mine)} departs.` };
}

/* ------------------------- Market listing ------------------------- */

export interface MarketEntry {
  player: Player;
  clubName: string;
  value: number;
  kind: 'TRANSFER' | 'FREE' | 'LOAN';
}

export function marketList(g: GameState, userClubId: string, kind: 'TRANSFER' | 'FREE' | 'LOAN', query: string, pos: string, maxAge: number): MarketEntry[] {
  const q = query.trim().toLowerCase();
  const out: MarketEntry[] = [];
  const ids = kind === 'FREE' ? g.freeAgentIds : Object.keys(g.players);
  for (const id of ids) {
    const p = g.players[id];
    if (!p) continue;
    if (kind !== 'FREE' && (!p.clubId || p.clubId === userClubId || p.loanFromClubId)) continue;
    if (pos !== 'ALL' && p.position !== pos) continue;
    if (p.age > maxAge) continue;
    const club = p.clubId ? g.clubs[p.clubId] : null;
    if (q && !`${p.firstName} ${p.lastName} ${club?.name ?? ''}`.toLowerCase().includes(q)) continue;
    if (kind === 'LOAN') {
      if (!club) continue;
      const rank = club.playerIds.map((x) => g.players[x]?.ca ?? 0).sort((a, b) => b - a).indexOf(p.ca);
      if (rank < 14 && p.age > 22) continue;
    }
    out.push({ player: p, clubName: club ? club.name : 'Free Agent', value: valuePlayer(p), kind });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 150);
}

/**
 * AI ↔ AI market across all five countries (active tiers + shadow leagues)
 * during transfer windows. A few deals a week; big ones make the back page.
 */
export function aiWorldTransfers(g: GameState, rng: Rng): void {
  if (windowFor(g.season.matchweek) === 'CLOSED') return;
  const userId = g.manager.clubId;
  const clubs = Object.values(g.clubs).filter((c) => c.id !== userId);
  const deals = rng.int(1, 4);
  const allIds = Object.keys(g.players);
  for (let d = 0; d < deals; d++) {
    const buyer = rng.weighted(clubs, clubs.map((c) => (c.tier === 1 ? 3 : c.tier === 2 ? 1 : 0.4) * (0.5 + c.reputation / 100)));
    if (buyer.playerIds.length >= 30 || buyer.finances.bank <= 0) continue;
    const floor = avgCa(g, buyer) + 1;
    let best: Player | null = null;
    for (let k = 0; k < 60; k++) {
      const p = g.players[allIds[Math.floor(rng.next() * allIds.length)]];
      if (!p || !p.clubId || p.clubId === userId || p.clubId === buyer.id || p.loanFromClubId || g.pendingYouth.includes(p.id)) continue;
      const seller = g.clubs[p.clubId];
      if (!seller || seller.reputation >= buyer.reputation + 5 || seller.playerIds.length <= 19) continue;
      if (p.ca < floor || p.age > 30) continue;
      if (!best || p.ca - p.age * 0.3 > best.ca - best.age * 0.3) best = p;
    }
    if (!best) continue;
    const seller = g.clubs[best.clubId!];
    const fee = Math.round(askingPrice(g, best, seller, buyer) * rng.range(1.0, 1.35) / 5000) * 5000;
    if (fee > buyer.finances.bank * 0.6) continue;
    buyer.finances.bank -= fee;
    credit(seller, fee, 'sales');
    buyer.finances.ledger.transfers += fee;
    movePlayer(g, best, buyer.id);
    best.contract = { wage: demandedWage(best, buyer), yearsLeft: rng.int(2, 5), releaseClause: null };
    newsTransfer(g, rng, best, seller, buyer, fee);
  }
}
