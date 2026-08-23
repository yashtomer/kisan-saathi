import type { Metadata } from 'next';
import Link from 'next/link';
import ExpertShell from '@/components/expert/ExpertShell';

export const metadata: Metadata = {
  title: 'How this works | Kisan Saathi',
  description:
    'The tech stack behind Kisan Saathi: Agora Conversational AI, the MCP tool layer, and what each part does.',
};

type Row = { name: string; detail: string; why: string };

const PIPELINE: Row[] = [
  {
    name: 'Deepgram nova-3',
    detail: 'Speech recognition, language set to multi',
    why: 'One stream carries Hindi and English together, so a farmer can switch language mid-sentence without touching anything',
  },
  {
    name: 'GPT-5 mini',
    detail: 'The reasoning that runs the triage',
    why: 'Decides what to ask next and when to call a tool. Chosen over a smaller model because it actually uses its tools instead of asking the farmer',
  },
  {
    name: 'MiniMax speech-2.6',
    detail: 'Hindi voice, hindi_male_1_v2',
    why: 'A Hindi voice reading Devanagari text. An English voice reading romanised Hindi is unintelligible to the person listening',
  },
  {
    name: 'Agora SD-RTN',
    detail: 'Real-time audio network, Asia-Pacific region',
    why: 'Carries the call. Pinned to AP so audio does not cross the Pacific and back for a farmer in Maharashtra',
  },
];

const TOOLS: Row[] = [
  {
    name: 'get_weather',
    detail: 'Open-Meteo, no API key',
    why: 'Rain and humidity change the diagnosis. The agent looks it up instead of asking a farmer to describe the weather',
  },
  {
    name: 'search_advisory',
    detail: 'Curated knowledge base, 8 conditions across 4 crops',
    why: 'Returns the one question that separates look-alike diseases, so the agent asks instead of guessing',
  },
  {
    name: 'create_case',
    detail: 'Structured record, 12 fields',
    why: 'Turns a conversation into something an agronomist can act on, including how confident the agent actually was',
  },
  {
    name: 'escalate_to_expert',
    detail: 'Marks the case and sets urgency',
    why: 'The handover point where a machine stops and a human takes over',
  },
  {
    name: 'book_expert_callback',
    detail: 'Google Calendar event and link',
    why: 'Gives the farmer a real time — "tomorrow at ten" — instead of a vague promise that someone will call',
  },
];

const SAFETY = [
  'Never states a pesticide dose, quantity or mixing ratio. That decision belongs to a human, and the knowledge base does not contain doses at all.',
  'Says out loud how confident it is, and that confidence is passed to the agronomist with the case.',
  'Escalates whenever it is unsure, the damage is spreading, or the farmer asks for a person.',
  'Tells anyone who asks that it is a computer assistant working alongside real agronomists.',
  'On pesticide exposure to a person, it stops advising and tells them to reach a doctor immediately.',
];

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li
          key={row.name}
          className="rounded-xl border border-border bg-card px-4 py-3.5"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-[family-name:var(--font-data)] text-sm font-semibold">
              {row.name}
            </span>
            <span className="text-xs text-muted-foreground">{row.detail}</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {row.why}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function TechPage() {
  return (
    <ExpertShell>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card/60">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
            <div className="flex flex-col gap-1">
              <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Kisan Saathi
              </span>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
                How this works
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-md border border-border bg-card px-3 py-2 text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back to case queue
            </Link>
          </div>
        </header>

        <main className="mx-auto flex max-w-3xl flex-col gap-10 px-5 py-8 sm:px-8">
          <p className="max-w-prose text-[15px] leading-relaxed">
            A farmer calls and describes a crop problem in Hindi, English, or a
            mix of both. Instead of answering immediately, the agent asks the
            questions an agronomist would ask, checks real data, and — when it
            is not certain — writes up a structured case and books a callback
            with a human expert. The farmer never has to explain the problem
            twice.
          </p>

          <Section eyebrow="The call" title="Voice pipeline">
            <RowList rows={PIPELINE} />
            <p className="text-sm text-muted-foreground">
              Barge-in is on, so the farmer can talk over the agent. Filler
              words play while a tool runs, because silence on a rural line
              reads as a dropped call. If the farmer goes quiet, the agent
              gently checks whether he is still there.
            </p>
          </Section>

          <Section eyebrow="What the agent can do" title="Tools">
            <RowList rows={TOOLS} />
            <p className="text-sm text-muted-foreground">
              Tools are served over the Model Context Protocol. Agora&apos;s
              cloud calls them during the conversation — the requests come
              inbound to this app, which is the opposite of how the rest of the
              system flows.
            </p>
          </Section>

          <Section eyebrow="Guardrails" title="What it will not do">
            <ul className="flex flex-col gap-2.5">
              {SAFETY.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Section>

          <Section eyebrow="Being honest" title="Known limits">
            <ul className="flex flex-col gap-2.5 text-sm leading-relaxed">
              <li className="rounded-xl border border-dashed border-border px-4 py-3">
                The knowledge base covers four crops. Anything outside it is
                escalated rather than guessed at.
              </li>
              <li className="rounded-xl border border-dashed border-border px-4 py-3">
                Speech recognition degrades in heavy field noise and on weak
                mobile connections.
              </li>
              <li className="rounded-xl border border-dashed border-border px-4 py-3">
                The agent is reached from a browser today. A phone line is the
                obvious next step — the design assumes a farmer on a feature
                phone with no app and no data — but connecting one was left out
                of this build rather than half-done.
              </li>
            </ul>
          </Section>
        </main>
      </div>
    </ExpertShell>
  );
}
