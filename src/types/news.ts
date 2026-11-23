import type { CountryCode } from './world';

export type NewsCategory =
  | 'TRANSFER'
  | 'TROPHY'
  | 'GIANT_KILLING'
  | 'INJURY'
  | 'FORM'
  | 'YOUTH'
  | 'RUMOUR'
  | 'MANAGER'
  | 'CLUB';

export interface NewsItem {
  id: string;
  year: number;
  matchweek: number;
  category: NewsCategory;
  headline: string;
  body: string;
  /** clubs the story is about */
  clubIds: string[];
  /** country of origin of the story */
  country: CountryCode;
  /** true if the story concerns the user's club */
  myClub: boolean;
  /** 1 (filler) .. 5 (front page lead) */
  weight: number;
}
