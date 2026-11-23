import { useGameStore } from './store/useGameStore';
import JobOfferDesk from './components/onboarding/JobOfferDesk';
import DeskShell from './components/layout/DeskShell';
import CloudLayer from './components/account/CloudLayer';

export default function App() {
  const game = useGameStore((s) => s.game);
  const needsDesk = !game || game.status === 'ONBOARDING' || game.status === 'SACKED' || !game.manager.clubId;
  return (
    <>
      {needsDesk ? <JobOfferDesk /> : <DeskShell />}
      <CloudLayer />
    </>
  );
}
