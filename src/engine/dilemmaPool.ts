/**
 * The long list of dressing-room dilemmas and press-conference questions.
 * Each entry is a lazy template: it returns null when it doesn't apply to the
 * current squad or situation, so the caller can just try them in random order.
 */
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Dilemma } from '../types/transfers';
import type { MatchResult } from '../types/match';
import { fullName, moraleLevel } from './ratings';
import { nextId } from './ids';
import { sortedTable } from './shadowLeagueEngine';

export type Template = () => Dilemma | null;

function squadOf(g: GameState, club: Club): Player[] {
  return club.playerIds.map((id) => g.players[id]).filter((p): p is Player => !!p);
}

/** 1-based league position of a club (0 if unknown). */
function tablePos(g: GameState, club: Club): number {
  const lg = g.leagues[club.leagueId];
  if (!lg) return 0;
  return sortedTable(lg.table).findIndex((r) => r.clubId === club.id) + 1;
}

/* ------------------------------------------------------------------ */
/* Dressing room dilemmas                                              */
/* ------------------------------------------------------------------ */

export function dilemmaTemplates(g: GameState, club: Club): Template[] {
  const squad = squadOf(g, club);
  const fit = squad.filter((p) => p.injuryWeeks === 0);
  const byCa = [...fit].sort((a, b) => b.ca - a.ca);
  const star = byCa[0];
  const young = [...fit].filter((p) => p.age <= 21).sort((a, b) => b.truePA - a.truePA)[0];
  const veteran = [...fit].sort((a, b) => b.age - a.age || b.ca - a.ca)[0];
  const benched = fit.filter((p) => !club.tactics.lineup.includes(p.id) && p.ca >= (byCa[13]?.ca ?? 0)).sort((a, b) => b.ca - a.ca)[0];
  const goalie = fit.filter((p) => p.position === 'GK').sort((a, b) => b.ca - a.ca)[0];
  const striker = fit.filter((p) => p.position === 'ST').sort((a, b) => b.ca - a.ca)[0];
  const captainish = [...fit].sort((a, b) => b.season.apps - a.season.apps || b.age - a.age)[0];
  const expiring = fit.filter((p) => p.contract.yearsLeft <= 1 && !p.loanFromClubId).sort((a, b) => b.ca - a.ca)[0];
  const unhappy = fit.filter((p) => moraleLevel(p.moraleValue) <= 1).sort((a, b) => b.ca - a.ca);
  const fanFav = fit.find((p) => p.fanFavorite);
  const fallen = fit.filter((p) => p.streak < 0).sort((a, b) => a.streak - b.streak)[0];
  const id = () => nextId(g, 'd');
  const wage = (p: Player) => p.contract.wage;

  return [
    () => young ? {
      id: id(), title: 'Youngster Wants Out',
      text: `${fullName(young)}, ${young.age}, thinks he's too good for the reserves. His dad has rung the club twice this week.`,
      options: [
        { label: 'Promise him a run in the team', description: 'He lights up. Older players mutter.', effects: [{ kind: 'PLAYER_MORALE', playerId: young.id, delta: 25 }, { kind: 'TEAM_ATMOSPHERE', delta: -3 }] },
        { label: 'Tell his dad to be patient', description: 'Firm and fair. He sulks for a week.', effects: [{ kind: 'PLAYER_MORALE', playerId: young.id, delta: -12 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
      ],
    } : null,
    () => benched ? {
      id: id(), title: 'Left on the Bench',
      text: `${fullName(benched)} stormed out of the dressing room after being left out again. The lads heard the door slam.`,
      options: [
        { label: 'Have a quiet word', description: 'He calms down. You owe him a game.', effects: [{ kind: 'PLAYER_MORALE', playerId: benched.id, delta: 14 }] },
        { label: 'Fine him', description: 'Authority shown. He stews.', effects: [{ kind: 'PLAYER_MORALE', playerId: benched.id, delta: -18 }, { kind: 'BANK', delta: wage(benched) }, { kind: 'TEAM_ATMOSPHERE', delta: 3 }] },
        { label: 'Ignore it', description: 'It blows over. Or it doesn\'t.', effects: [{ kind: 'PLAYER_MORALE', playerId: benched.id, delta: -6 }] },
      ],
    } : null,
    () => goalie ? {
      id: id(), title: 'Keeper\'s Confidence',
      text: `${fullName(goalie)} has been dropping crosses in training and it's getting into his head.`,
      options: [
        { label: 'Extra sessions with the keeping coach', description: 'He works hard. He is tired but sharper.', effects: [{ kind: 'PLAYER_FITNESS', playerId: goalie.id, delta: -6 }, { kind: 'PLAYER_MORALE', playerId: goalie.id, delta: 14 }] },
        { label: 'Publicly back him', description: 'He feels trusted. The back four notice.', effects: [{ kind: 'PLAYER_MORALE', playerId: goalie.id, delta: 20 }, { kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
      ],
    } : null,
    () => striker ? {
      id: id(), title: 'Striker on a Drought',
      text: `${fullName(striker)} hasn't scored in weeks and the papers are circling.`,
      options: [
        { label: 'Take him out for a meal', description: 'He feels looked after. Costs you a bit.', effects: [{ kind: 'PLAYER_MORALE', playerId: striker.id, delta: 18 }, { kind: 'BANK', delta: -2500 }] },
        { label: 'Tell him to work harder', description: 'He grits his teeth. The squad likes the standards.', effects: [{ kind: 'PLAYER_MORALE', playerId: striker.id, delta: -8 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
      ],
    } : null,
    () => veteran && veteran.age >= 31 ? {
      id: id(), title: 'The Old Pro',
      text: `${fullName(veteran)}, ${veteran.age}, offers to run the youngsters' extra sessions. It would keep him busy and cost him energy.`,
      options: [
        { label: 'Let him mentor', description: 'He feels respected. The kids learn; his legs pay.', effects: [{ kind: 'PLAYER_MORALE', playerId: veteran.id, delta: 18 }, { kind: 'PLAYER_FITNESS', playerId: veteran.id, delta: -8 }, { kind: 'TEAM_ATMOSPHERE', delta: 3 }] },
        { label: 'Rest him instead', description: 'Fresh legs. He feels shunted aside.', effects: [{ kind: 'PLAYER_MORALE', playerId: veteran.id, delta: -8 }, { kind: 'PLAYER_FITNESS', playerId: veteran.id, delta: 6 }] },
      ],
    } : null,
    () => expiring ? {
      id: id(), title: 'Contract Running Down',
      text: `${fullName(expiring)}'s deal is almost up and his agent is hinting that other clubs have called.`,
      options: [
        { label: 'Reassure him a new deal is coming', description: 'He relaxes. You\'ll need to follow through.', effects: [{ kind: 'PLAYER_MORALE', playerId: expiring.id, delta: 18 }] },
        { label: 'Tell him you\'ll decide in the summer', description: 'Honest. He grows restless.', effects: [{ kind: 'PLAYER_MORALE', playerId: expiring.id, delta: -12 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      ],
    } : null,
    () => captainish ? {
      id: id(), title: 'Captain\'s Armband',
      text: `The senior players are split on who should be captain. ${fullName(captainish)} thinks it should be him.`,
      options: [
        { label: `Give it to ${captainish.lastName}`, description: 'He walks tall. Others feel passed over.', effects: [{ kind: 'PLAYER_MORALE', playerId: captainish.id, delta: 22 }, { kind: 'TEAM_ATMOSPHERE', delta: -2 }] },
        { label: 'Let the players vote', description: 'Democracy. The room warms to you.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 5 }, { kind: 'PLAYER_MORALE', playerId: captainish.id, delta: -4 }] },
      ],
    } : null,
    () => fallen ? {
      id: id(), title: 'Crisis of Confidence',
      text: `${fullName(fallen)} is low on confidence after a poor run. He keeps passing sideways and avoiding the ball.`,
      options: [
        { label: 'Give him a few days off', description: 'He recovers his legs and some of his spirit.', effects: [{ kind: 'PLAYER_FITNESS', playerId: fallen.id, delta: 12 }, { kind: 'PLAYER_MORALE', playerId: fallen.id, delta: 6 }] },
        { label: 'Put an arm round him', description: 'He feels backed. A bit of a lift.', effects: [{ kind: 'PLAYER_MORALE', playerId: fallen.id, delta: 16 }] },
        { label: 'Drop him a game', description: 'A short sharp shock.', effects: [{ kind: 'PLAYER_MORALE', playerId: fallen.id, delta: -10 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      ],
    } : null,
    () => fanFav ? {
      id: id(), title: 'Fans\' Favourite',
      text: `The supporters are chanting ${fullName(fanFav)}'s name and want you to start him every week.`,
      options: [
        { label: 'Salute the crowd and start him', description: 'The terraces love it. The others notice.', effects: [{ kind: 'FAN_INTEREST', delta: 5 }, { kind: 'PLAYER_MORALE', playerId: fanFav.id, delta: 12 }, { kind: 'TEAM_ATMOSPHERE', delta: -2 }] },
        { label: 'Pick on merit', description: 'The room respects it. The fans mutter.', effects: [{ kind: 'FAN_INTEREST', delta: -3 }, { kind: 'TEAM_ATMOSPHERE', delta: 3 }] },
      ],
    } : null,
    () => unhappy.length >= 3 ? {
      id: id(), title: 'Unrest in the Squad',
      text: `${fullName(unhappy[0])}, ${fullName(unhappy[1])} and ${fullName(unhappy[2])} are huddled in the corner and not happy.`,
      options: [
        { label: 'Call a team meeting', description: 'Air cleared, for now.', effects: [{ kind: 'SQUAD_MORALE', delta: 4 }, { kind: 'TEAM_ATMOSPHERE', delta: 3 }, { kind: 'PLAYER_FITNESS', playerId: unhappy[0].id, delta: -2 }] },
        { label: 'See them one by one', description: 'Takes time, but they feel heard.', effects: [{ kind: 'PLAYER_MORALE', playerId: unhappy[0].id, delta: 14 }, { kind: 'PLAYER_MORALE', playerId: unhappy[1].id, delta: 14 }, { kind: 'PLAYER_MORALE', playerId: unhappy[2].id, delta: 14 }] },
        { label: 'Let them get on with it', description: 'Their problem. It festers.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: -4 }] },
      ],
    } : null,
    () => ({
      id: id(), title: 'Winter Training Camp',
      text: 'The assistant suggests a mid-season training camp somewhere warm. It costs money and a few lazy mornings.',
      options: [
        { label: 'Book it', description: 'Bonding and fresh legs. Costs $40K.', effects: [{ kind: 'BANK', delta: -40000 }, { kind: 'TEAM_ATMOSPHERE', delta: 8 }, { kind: 'SQUAD_FITNESS', delta: 6 }] },
        { label: 'Stay home', description: 'Savings. The squad shrugs.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Tactics Leak',
      text: 'Your team news ended up in the local paper before the match. Someone talked.',
      options: [
        { label: 'Hold a witch hunt', description: 'You find nobody. The room is on edge.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: -6 }, { kind: 'BOARD', delta: 1 }] },
        { label: 'Shrug it off', description: 'Nothing changes. The board frowns.', effects: [{ kind: 'BOARD', delta: -2 }] },
        { label: 'Close training to the press', description: 'Fewer leaks. Journalists sulk.', effects: [{ kind: 'FAN_INTEREST', delta: -2 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Chairman\'s Pet Project',
      text: 'The chairman wants you to play his nephew in the reserves "to give him exposure". He makes it sound very optional.',
      options: [
        { label: 'Humour him', description: 'The board is pleased. The reserves roll their eyes.', effects: [{ kind: 'BOARD', delta: 5 }, { kind: 'TEAM_ATMOSPHERE', delta: -3 }] },
        { label: 'Politely refuse', description: 'Standards kept. The chairman cools on you.', effects: [{ kind: 'BOARD', delta: -4 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Local Radio Offer',
      text: 'The local radio station will pay for a weekly phone-in with you. It will be tiring and a bit cheesy.',
      options: [
        { label: 'Do it', description: '+$25K and the fans get a voice.', effects: [{ kind: 'BANK', delta: 25000 }, { kind: 'FAN_INTEREST', delta: 4 }] },
        { label: 'Turn it down', description: 'Focus on the football.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Fan Group Protest',
      text: 'A supporters\' group plans a protest outside the ground about ticket prices. They want you to say something.',
      options: [
        { label: 'Back the fans', description: 'The terraces cheer. The board winces.', effects: [{ kind: 'FAN_INTEREST', delta: 7 }, { kind: 'BOARD', delta: -3 }] },
        { label: 'Stay out of it', description: 'Safe. The fans feel ignored.', effects: [{ kind: 'FAN_INTEREST', delta: -3 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Free Tickets Row',
      text: 'The players want more complimentary tickets for their families. The commercial manager says no.',
      options: [
        { label: 'Fight their corner', description: 'The lads are pleased. Costs a little.', effects: [{ kind: 'SQUAD_MORALE', delta: 4 }, { kind: 'BANK', delta: -8000 }] },
        { label: 'Back the commercial manager', description: 'Rules are rules. Some grumbling.', effects: [{ kind: 'SQUAD_MORALE', delta: -3 }, { kind: 'BOARD', delta: 1 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Pre-match Meal Mix-up',
      text: 'Half the squad has stomach trouble after the hotel buffet. The physio wants you to rest them.',
      options: [
        { label: 'Rest the affected players', description: 'Safe, but a few legs are heavy.', effects: [{ kind: 'SQUAD_FITNESS', delta: -3 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
        { label: 'Play on through it', description: 'Tough love. A few get worse.', effects: [{ kind: 'SQUAD_FITNESS', delta: -7 }, { kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Rival Manager Jibe',
      text: 'A rival manager called your side "a bunch of journeymen" on national radio. The papers want your reply.',
      options: [
        { label: 'Fire back', description: 'The fans love the fire. The board winces.', effects: [{ kind: 'FAN_INTEREST', delta: 5 }, { kind: 'TEAM_ATMOSPHERE', delta: 4 }, { kind: 'BOARD', delta: -2 }] },
        { label: 'Rise above it', description: 'Dignified. A little dull.', effects: [{ kind: 'BOARD', delta: 2 }] },
        { label: 'Pin it on the dressing-room wall', description: 'The squad is fired up. Quietly.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 6 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Boot Deal Squabble',
      text: 'Two players have separate boot deals and are arguing over who gets to wear them in the team photo.',
      options: [
        { label: 'Let each wear their own', description: 'Peace. The photo looks a mess.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
        { label: 'Team kit only', description: 'Discipline. Agents ring the club.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }, { kind: 'SQUAD_MORALE', delta: -2 }] },
      ],
    }),
    () => star ? {
      id: id(), title: 'Star Wants Time Off',
      text: `${fullName(star)} wants a few days away after a family matter. Tonight's training is important.`,
      options: [
        { label: 'Give him the time', description: 'He is grateful. Your discipline is questioned.', effects: [{ kind: 'PLAYER_MORALE', playerId: star.id, delta: 18 }, { kind: 'PLAYER_FITNESS', playerId: star.id, delta: 10 }, { kind: 'TEAM_ATMOSPHERE', delta: -2 }] },
        { label: 'Say no', description: 'Business first. He remembers it.', effects: [{ kind: 'PLAYER_MORALE', playerId: star.id, delta: -16 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      ],
    } : null,
    () => ({
      id: id(), title: 'Academy Open Day',
      text: 'The youth coach wants your first team to join the academy open day for local kids. Players grumble about the day off.',
      options: [
        { label: 'Send the first team', description: 'Good publicity. Tired legs.', effects: [{ kind: 'FAN_INTEREST', delta: 4 }, { kind: 'SQUAD_FITNESS', delta: -3 }, { kind: 'BOARD', delta: 1 }] },
        { label: 'Send a few youngsters', description: 'Quiet and sensible. Little change.', effects: [{ kind: 'FAN_INTEREST', delta: 1 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Mystery Bonus',
      text: 'The squad hears the board gave the manager of the club down the road a bonus. They want to know where theirs is.',
      options: [
        { label: 'Ask the board for win bonuses', description: 'It costs $30K but the room works harder.', effects: [{ kind: 'BANK', delta: -30000 }, { kind: 'SQUAD_MORALE', delta: 5 }, { kind: 'TEAM_ATMOSPHERE', delta: 4 }] },
        { label: 'Promise nothing', description: 'Your reputation for honesty grows.', effects: [{ kind: 'SQUAD_MORALE', delta: -3 }, { kind: 'BOARD', delta: 2 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Pitch Complaints',
      text: 'The groundsman says the pitch needs rest, which means fewer sessions on it. The coaching staff are annoyed.',
      options: [
        { label: 'Rest the pitch', description: 'Better surface. Lighter training week.', effects: [{ kind: 'SQUAD_FITNESS', delta: 3 }, { kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
        { label: 'Train as normal', description: 'Sharper players. A worse pitch.', effects: [{ kind: 'SQUAD_FITNESS', delta: -3 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      ],
    }),
    () => ({
      id: id(), title: 'Scouting Tip-off',
      text: 'An old friend in the game tips you off about a bargain, if you take his lad on trial. He hints he\'d like a drink in return.',
      options: [
        { label: 'Take him for a drink', description: 'Pleasant evening. Costs $4K. Staff are pleased.', effects: [{ kind: 'BANK', delta: -4000 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
        { label: 'Politely decline', description: 'You owe nobody anything. A little lonely.', effects: [{ kind: 'BOARD', delta: 1 }] },
      ],
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Press conference questions (situational)                            */
/* ------------------------------------------------------------------ */

export function pressTemplates(g: GameState, club: Club, r: MatchResult | undefined): Template[] {
  const squad = squadOf(g, club);
  const byCa = [...squad].sort((a, b) => b.ca - a.ca);
  const star = byCa[0];
  const id = () => nextId(g, 'pc');
  const out: Template[] = [];
  const pos = tablePos(g, club);
  const leagueSize = Object.keys(g.leagues[club.leagueId]?.table ?? {}).length || 16;
  const mw = g.season.matchweek;
  const injured = squad.filter((p) => p.injuryWeeks > 2).sort((a, b) => b.ca - a.ca)[0];
  const streak = club.streak;
  const young = squad.filter((p) => p.age <= 20 && p.season.apps > 0).sort((a, b) => b.ca - a.ca)[0];
  const mk = (text: string, options: Dilemma['options']): Template => () => ({ id: id(), title: 'Press Conference', text, options });

  if (streak >= 4) out.push(mk(`"${streak} wins on the bounce. Can anyone stop you?"`, [
    { label: '"One game at a time."', description: 'Calm and measured. Squad stays hungry.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
    { label: '"We\'re going all the way."', description: 'The fans dream. The pressure rises.', effects: [{ kind: 'FAN_INTEREST', delta: 4 }, { kind: 'BOARD', delta: -1 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
  ]));
  if (streak <= -3) out.push(mk(`"${-streak} defeats in a row. Is this a crisis?"`, [
    { label: '"We\'ll turn it around."', description: 'Confident. Believe it or not.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }, { kind: 'FAN_INTEREST', delta: -1 }] },
    { label: '"Yes, it is, and I own it."', description: 'The board respects the honesty. The fans are uneasy.', effects: [{ kind: 'BOARD', delta: 2 }, { kind: 'FAN_INTEREST', delta: -2 }] },
    { label: '"I won\'t answer that."', description: 'You storm out. The papers love it.', effects: [{ kind: 'FAN_INTEREST', delta: -3 }, { kind: 'BOARD', delta: -2 }] },
  ]));
  if (pos === 1 && mw >= 6) out.push(mk('"You\'re top of the table. Are you title contenders?"', [
    { label: '"We have the squad for it."', description: 'The fans dream big. The board wants it now.', effects: [{ kind: 'FAN_INTEREST', delta: 5 }, { kind: 'BOARD', delta: -1 }] },
    { label: '"It\'s far too early."', description: 'Level-headed. The squad stays grounded.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }, { kind: 'BOARD', delta: 1 }] },
  ]));
  if (pos >= leagueSize - 2 && mw >= 8) out.push(mk(`"You're in the bottom ${leagueSize - pos + 1}. Are you worried about relegation?"`, [
    { label: '"No. We have the quality."', description: 'Defiant. The dressing room rallies a little.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 3 }, { kind: 'BOARD', delta: -1 }] },
    { label: '"It\'s a fight, and we\'ll fight."', description: 'Honest. The fans appreciate the grit.', effects: [{ kind: 'FAN_INTEREST', delta: 3 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
  ]));
  if (pos >= 2 && pos <= 4 && mw >= 10) out.push(mk('"You\'re in the promotion race. Is the board expecting it of you?"', [
    { label: '"We aim high every week."', description: 'Ambition. The board likes it.', effects: [{ kind: 'BOARD', delta: 2 }, { kind: 'FAN_INTEREST', delta: 2 }] },
    { label: '"No expectations, just effort."', description: 'The squad stays relaxed.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }, { kind: 'BOARD', delta: -1 }] },
  ]));
  if (r) {
    const mineHome = r.homeId === club.id;
    const gf = mineHome ? r.homeGoals : r.awayGoals;
    const ga = mineHome ? r.awayGoals : r.homeGoals;
    const opp = g.clubs[mineHome ? r.awayId : r.homeId];
    if (gf - ga >= 3) out.push(mk(`"${gf}-${ga} against ${opp.name}. Is that your best performance yet?"`, [
      { label: '"Everything clicked."', description: 'Joy all round. A bit of swagger.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 4 }, { kind: 'FAN_INTEREST', delta: 2 }] },
      { label: '"We could still improve."', description: 'The squad rolls its eyes but stays sharp.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }, { kind: 'BOARD', delta: 1 }] },
    ]));
    if (ga - gf >= 3) out.push(mk(`"${ga}-${gf}. That was embarrassing. What went wrong?"`, [
      { label: '"I take the blame."', description: 'Shielding the players. They remember it.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 4 }, { kind: 'BOARD', delta: -2 }] },
      { label: '"They need to look in the mirror."', description: 'The board nods. The dressing room freezes.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: -5 }, { kind: 'BOARD', delta: 2 }] },
      { label: '"We\'ll talk about it in private."', description: 'Professional. The press want more.', effects: [{ kind: 'FAN_INTEREST', delta: -1 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
    ]));
    if (ga === 0 && gf > 0) out.push(mk('"A clean sheet again. Is it your defence or your goalkeeper?"', [
      { label: '"It starts from the front."', description: 'A team effort. Nobody feels singled out.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 3 }] },
      { label: '"The back line is brilliant."', description: 'The defenders glow. The forwards grumble.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }, { kind: 'SQUAD_MORALE', delta: 1 }] },
    ]));
    if (gf === 0 && ga > 0) out.push(mk('"No goals again. Is your attack the problem?"', [
      { label: '"We created chances."', description: 'Positive. The fans aren\'t sure.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
      { label: '"We need to be more clinical."', description: 'Straight talk. The strikers feel the heat.', effects: [{ kind: 'SQUAD_MORALE', delta: -1 }, { kind: 'BOARD', delta: 1 }] },
    ]));
    if (r.competition === 'CUP') out.push(mk(`"Cup football against ${opp.name}. Is the cup a priority for you?"`, [
      { label: '"We want a trophy."', description: 'Fans love ambition. The league might suffer.', effects: [{ kind: 'FAN_INTEREST', delta: 4 }, { kind: 'BOARD', delta: 1 }] },
      { label: '"The league comes first."', description: 'Sensible. Some say you lack ambition.', effects: [{ kind: 'FAN_INTEREST', delta: -2 }, { kind: 'BOARD', delta: 1 }] },
    ]));
    if (gf > ga && r.keyMoments?.length > 4) out.push(mk('"That match was a rollercoaster. Were there some decisions you weren\'t happy with?"', [
      { label: '"No complaints."', description: 'Dignified. Little changes.', effects: [{ kind: 'BOARD', delta: 1 }] },
      { label: '"The officials were poor."', description: 'The fans cheer. A fine may follow.', effects: [{ kind: 'FAN_INTEREST', delta: 3 }, { kind: 'BANK', delta: -3000 }] },
    ]));
    if (gf < ga) out.push(mk(`"That referee decision against ${opp.name}. Do you think it cost you?"`, [
      { label: '"I won\'t talk about referees."', description: 'Classy. Nothing changes.', effects: [{ kind: 'BOARD', delta: 1 }] },
      { label: '"It was a joke."', description: 'The terraces roar. The league fines you.', effects: [{ kind: 'FAN_INTEREST', delta: 3 }, { kind: 'BANK', delta: -4000 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
    ]));
  }
  if (injured) out.push(mk(`"${fullName(injured)} is going to be out for a while. How big a blow is that?"`, [
    { label: '"Big, but we have depth."', description: 'Calm. The squad feels trusted.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
    { label: '"He is irreplaceable."', description: `${injured.lastName} is touched. The reserves less so.`, effects: [{ kind: 'PLAYER_MORALE', playerId: injured.id, delta: 10 }, { kind: 'SQUAD_MORALE', delta: -1 }] },
  ]));
  if (young) out.push(mk(`"${fullName(young)}, ${young.age}, is catching the eye. Are you giving youth a chance?"`, [
    { label: '"If they\'re good enough, they\'re old enough."', description: `${young.lastName} glows. The fans like the philosophy.`, effects: [{ kind: 'PLAYER_MORALE', playerId: young.id, delta: 14 }, { kind: 'FAN_INTEREST', delta: 2 }] },
    { label: '"He needs to keep his feet on the ground."', description: 'Grounded. He listens.', effects: [{ kind: 'PLAYER_MORALE', playerId: young.id, delta: 2 }, { kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
  ]));
  if (club.finances.bank > 300000) out.push(mk('"The club has money in the bank. Will you be spending in the next window?"', [
    { label: '"Yes, we\'ll strengthen."', description: 'The fans get excited. Expect a fan-letter.', effects: [{ kind: 'FAN_INTEREST', delta: 4 }, { kind: 'BOARD', delta: -1 }] },
    { label: '"We\'ll spend wisely."', description: 'Prudent. The board nods.', effects: [{ kind: 'BOARD', delta: 2 }] },
  ]));
  if (club.finances.bank < 0) out.push(mk('"Reports suggest the club is deep in the red. How bad is it?"', [
    { label: '"The board has it under control."', description: 'The chairman is pleased. Journalists aren\'t.', effects: [{ kind: 'BOARD', delta: 2 }, { kind: 'FAN_INTEREST', delta: -2 }] },
    { label: '"Money is tight. We\'ll cope."', description: 'Honest. The fans are worried.', effects: [{ kind: 'FAN_INTEREST', delta: -3 }, { kind: 'BOARD', delta: -1 }] },
  ]));
  if (club.board.value < 35) out.push(mk('"The board are reportedly unhappy. Is your job under threat?"', [
    { label: '"I\'m fully focused on the team."', description: 'Calm. The pressure is still there.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
    { label: '"I have the chairman\'s backing."', description: 'A confident lie? The board hears it.', effects: [{ kind: 'BOARD', delta: -3 }, { kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
  ]));
  if (club.board.value > 75) out.push(mk('"The board seem delighted with you. Are you happy here for the long term?"', [
    { label: '"I\'d love to stay."', description: 'The chairman beams. Your stock rises.', effects: [{ kind: 'BOARD', delta: 3 }] },
    { label: '"I take it a year at a time."', description: 'Honest. The fans worry you might leave.', effects: [{ kind: 'FAN_INTEREST', delta: -1 }, { kind: 'BOARD', delta: -1 }] },
  ]));
  if (star) out.push(mk(`"What does ${fullName(star)} bring to the team?"`, [
    { label: '"Everything. He\'s our heartbeat."', description: `${star.lastName} loves it. Others raise an eyebrow.`, effects: [{ kind: 'PLAYER_MORALE', playerId: star.id, delta: 10 }, { kind: 'TEAM_ATMOSPHERE', delta: -1 }] },
    { label: '"Football is a team game."', description: 'A diplomatic reply. Fine with everyone.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 1 }] },
  ]));
  out.push(mk('"How would you describe the mood in the camp this week?"', [
    { label: '"Buzzing."', description: 'Optimistic. The squad enjoys hearing it.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
    { label: '"Professional, nothing more."', description: 'Dry. Nothing changes.', effects: [] },
    { label: '"Ask me after the next match."', description: 'Cheeky. The press chuckle.', effects: [{ kind: 'FAN_INTEREST', delta: 1 }] },
  ]));
  out.push(mk('"What\'s your message to the supporters ahead of next week?"', [
    { label: '"Come and make some noise."', description: 'The terraces buzz.', effects: [{ kind: 'FAN_INTEREST', delta: 3 }] },
    { label: '"Be patient. We\'re building."', description: 'Realistic. Some want more fire.', effects: [{ kind: 'BOARD', delta: 1 }] },
  ]));
  out.push(mk('"Your tactics have been called boring in the papers. Does that bother you?"', [
    { label: '"Results matter more than style."', description: 'Pragmatic. The fans want entertainment.', effects: [{ kind: 'BOARD', delta: 1 }, { kind: 'FAN_INTEREST', delta: -1 }] },
    { label: '"We play it our way."', description: 'Stubborn but loved by the dressing room.', effects: [{ kind: 'TEAM_ATMOSPHERE', delta: 2 }] },
  ]));
  if (g.season.window !== 'CLOSED') out.push(mk('"The window is open. Are you looking to sell anyone?"', [
    { label: '"Everyone is staying."', description: 'Reassuring for the squad.', effects: [{ kind: 'SQUAD_MORALE', delta: 2 }] },
    { label: '"Anyone can go for the right price."', description: 'Realistic. Players wonder if it\'s them.', effects: [{ kind: 'SQUAD_MORALE', delta: -2 }, { kind: 'BOARD', delta: 1 }] },
  ]));
  return out;
}
