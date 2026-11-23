import { describe, it, expect } from 'vitest';
import { generateWorld } from '../worldGenerator';
import { acceptJob } from '../seasonLoop';
import { encode, decode, summarize } from '../../cloud/sync';

describe('cloud save packing', () => {
  it('round-trips a career and shrinks it a lot', async () => {
    const g = generateWorld('T', 'ENG', 7);
    acceptJob(g, g.jobOffers[0].id);
    const packed = await encode(g);
    const raw = JSON.stringify(g).length;
    expect(packed.length).toBeLessThan(raw / 3);
    const back = await decode(packed);
    expect(JSON.stringify(back)).toBe(JSON.stringify(g));
    expect(summarize(back).manager).toBe('T');
  });
});
