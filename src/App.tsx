import { useGameStore } from './store/useGameStore';
import JobOfferDesk from './components/onboarding/JobOfferDesk';
import DeskShell from './components/layout/DeskShell';

export default function App() {
  const game = useGameStore((s) => s.game);
  if (!game || game.status === 'ONBOARDING' || game.status === 'SACKED' || !game.manager.clubId) return <JobOfferDesk />;
  return <DeskShell />;
}
