import type { Country, CountryCode } from '../types/world';

export const COUNTRIES: Record<CountryCode, Country> = {
  ENG: {
    code: 'ENG', name: 'England', flag: '🏴',
    leagueNames: ['The Premier Division', 'Division One', 'Division Two'],
    cupName: 'The Association Cup',
    tvMoneyMult: 1.45, wageMult: 1.35, wageCapMult: null, facilityCostMult: 1.1, foreignFeeMult: 1.0,
    statLean: { physical: 2, pace: 2 },
  },
  ESP: {
    code: 'ESP', name: 'Spain', flag: '🇪🇸',
    leagueNames: ['Primera Liga', 'Segunda Liga', 'Tercera Liga'],
    cupName: 'Copa del Reino',
    tvMoneyMult: 1.1, wageMult: 1.0, wageCapMult: 1.25, facilityCostMult: 1.0, foreignFeeMult: 1.0,
    statLean: { passing: 2, dribbling: 2 },
  },
  ITA: {
    code: 'ITA', name: 'Italy', flag: '🇮🇹',
    leagueNames: ['Serie Alta', 'Serie Media', 'Serie Bassa'],
    cupName: 'Coppa Nazionale',
    tvMoneyMult: 1.15, wageMult: 1.05, wageCapMult: null, facilityCostMult: 1.0, foreignFeeMult: 1.0,
    statLean: { defending: 2, reflexes: 2, positioning: 2, handling: 1 },
  },
  GER: {
    code: 'GER', name: 'Germany', flag: '🇩🇪',
    leagueNames: ['Erste Liga', 'Zweite Liga', 'Dritte Liga'],
    cupName: 'Bundespokal',
    tvMoneyMult: 1.05, wageMult: 0.95, wageCapMult: null, facilityCostMult: 0.75, foreignFeeMult: 1.0,
    statLean: { physical: 3 },
  },
  FRA: {
    code: 'FRA', name: 'France', flag: '🇫🇷',
    leagueNames: ['Ligue Élite', 'Ligue Deux', 'National'],
    cupName: 'Coupe Nationale',
    tvMoneyMult: 0.85, wageMult: 0.9, wageCapMult: null, facilityCostMult: 1.0, foreignFeeMult: 1.2,
    statLean: { pace: 2, dribbling: 2 },
  },
};
