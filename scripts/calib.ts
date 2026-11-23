import { simulateMatch } from '../src/engine/matchEngine';
import { createRng } from '../src/engine/rng';
import { makeTeam } from '../src/engine/__tests__/helpers';
const rng = createRng(5);
const pairs = [[85,55],[75,62],[70,70],[65,60],[80,72],[60,55],[58,80]];
const t0 = Date.now();
for (const [a,b] of pairs) {
  let w=0,d=0,l=0,gh=0,ga=0,sh=0,poss=0,xg=0;
  const N=300;
  for (let i=0;i<N;i++){
    const r = simulateMatch(makeTeam('H',a,i), makeTeam('A',b,1000+i), {competition:'LEAGUE',isKnockout:false,isDerby:false,neutralVenue:true,mode:'AUTO_SIM'}, rng);
    if(r.homeGoals>r.awayGoals)w++;else if(r.homeGoals===r.awayGoals)d++;else l++;
    gh+=r.homeGoals;ga+=r.awayGoals;sh+=r.home.shots+r.away.shots;poss+=r.home.possessionPct;xg+=r.home.xg+r.away.xg;
  }
  console.log(a,b,'W',(w/N*100).toFixed(0),'D',(d/N*100).toFixed(0),'L',(l/N*100).toFixed(0),'goals',(gh/N).toFixed(2),(ga/N).toFixed(2),'shots',(sh/N).toFixed(1),'poss',(poss/N).toFixed(0),'xg',(xg/N).toFixed(2));
}
console.log('ms', Date.now()-t0);
