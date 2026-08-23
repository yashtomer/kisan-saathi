import CaseBoard from '@/components/expert/CaseBoard';
import ExpertShell from '@/components/expert/ExpertShell';

/**
 * The dashboard is the front door: this system is operated by agronomists,
 * and farmers reach the agent by phone or from the call panel, not by
 * browsing to a landing page.
 */
export default function Home() {
  return (
    <ExpertShell>
      <CaseBoard />
    </ExpertShell>
  );
}
