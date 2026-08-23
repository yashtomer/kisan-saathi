import CaseBoard from '@/components/expert/CaseBoard';
import ExpertShell from '@/components/expert/ExpertShell';

/** Kept alongside `/` so existing links to /expert still resolve. */
export default function ExpertPage() {
  return (
    <ExpertShell>
      <CaseBoard />
    </ExpertShell>
  );
}
