import { generateWorld } from '../src/engine/worldGenerator';
import { squadStrength } from '../src/engine/lineup';
const acc: Record<string, number[]> = {};
let t3: number[] = [];
for (let s = 1; s <= 12; s++) {
  const g = generateWorld('T', 'ENG', s * 101);
  for (const c of Object.values(g.clubs)) {
    if (c.archetype) (acc[c.archetype] ??= []).push(squadStrength(g, c));
    else if (c.tier === 3 && !c.isShadow) t3.push(squadStrength(g, c));
  }
}
for (const [k, v] of Object.entries(acc)) console.log(k, (v.reduce((a, b) => a + b) / v.length).toFixed(1));
console.log('tier3 others', (t3.reduce((a, b) => a + b) / t3.length).toFixed(1));
