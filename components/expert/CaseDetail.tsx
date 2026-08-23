'use client';

import type { FarmerCase } from '@/lib/cases/store';

/**
 * The full handover record for one case, shown in the side panel on wide
 * screens and inline on narrow ones.
 *
 * Ordered the way an agronomist reads it: the farmer's own words first, then
 * the facts that change the diagnosis, then what was promised to him.
 */

const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'agent unsure',
  medium: 'agent fairly sure',
  high: 'agent confident',
};

const CONFIDENCE_STYLE: Record<string, string> = {
  low: 'text-amber-700 bg-amber-500/10 border-amber-600/30',
  medium: 'text-muted-foreground bg-secondary border-border',
  high: 'text-emerald-700 bg-emerald-500/10 border-emerald-600/30',
};

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-sm leading-relaxed">{value}</span>
    </div>
  );
}

export default function CaseDetail({
  item,
  onResolve,
}: {
  item: FarmerCase;
  onResolve: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-[family-name:var(--font-data)] text-base font-semibold tabular-nums">
          {item.id}
        </span>
        {item.confidence && (
          <span
            className={`rounded-full border px-2 py-0.5 font-[family-name:var(--font-data)] text-[10px] uppercase tracking-wider ${
              CONFIDENCE_STYLE[item.confidence]
            }`}
          >
            {CONFIDENCE_LABEL[item.confidence]}
          </span>
        )}
        <span className="ml-auto font-[family-name:var(--font-data)] text-[11px] text-muted-foreground">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* His words lead, because that is what he actually said. */}
      <blockquote className="border-l-2 border-primary/40 bg-primary/5 py-2.5 pl-3.5 pr-3 text-sm leading-relaxed">
        {item.symptoms}
      </blockquote>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Crop" value={item.crop} />
        <Field label="Village" value={item.village} />
        <Field label="Farmer" value={item.farmerName} />
        <Field label="Spoke" value={item.language} />
        <Field label="How long" value={item.durationDays} />
        <Field label="Area affected" value={item.affectedArea} />
        <Field label="Spreading" value={item.spreading} />
        <Field label="Already sprayed" value={item.recentTreatment} />
      </div>

      {(item.suspectedCause || item.weatherContext) && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <Field label="Agent's hypothesis" value={item.suspectedCause} />
          <Field label="Weather at the time" value={item.weatherContext} />
        </div>
      )}

      {item.escalationReason && (
        <div className="rounded-lg border border-amber-600/25 bg-amber-500/5 px-3.5 py-3">
          <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.14em] text-amber-700">
            Why it needs you
          </span>
          <p className="mt-1 text-sm leading-relaxed">{item.escalationReason}</p>
        </div>
      )}

      {item.appointmentAt && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Callback promised to the farmer
            </span>
            <span className="text-sm font-medium">
              {new Date(item.appointmentAt).toLocaleString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
              })}{' '}
              IST
            </span>
          </div>
          {item.appointmentLink && (
            <a
              href={item.appointmentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded-md border border-primary/40 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Add to calendar
            </a>
          )}
        </div>
      )}

      {item.transcript && item.transcript.length > 0 && (
        <details className="group rounded-lg border border-border">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="font-[family-name:var(--font-data)] uppercase tracking-[0.14em]">
              Full call
            </span>
            <span className="ml-2 tabular-nums opacity-70">
              {item.transcript.length} turns
            </span>
            <span className="ml-2 opacity-60 group-open:hidden">show</span>
            <span className="ml-2 hidden opacity-60 group-open:inline">hide</span>
          </summary>

          {/* Capped height: a long call should not push the actions off screen. */}
          <div className="max-h-72 overflow-y-auto border-t border-border px-3.5 py-3">
            <ol className="flex flex-col gap-2.5">
              {item.transcript.map((turn, index) => (
                <li
                  key={`${turn.at}-${index}`}
                  className={
                    turn.speaker === 'agent' ? 'text-muted-foreground' : ''
                  }
                >
                  <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {turn.speaker === 'agent' ? 'Kisan Saathi' : 'Farmer'}
                  </span>
                  <p className="text-sm leading-relaxed">{turn.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </details>
      )}

      {item.status !== 'resolved' && (
        <button
          type="button"
          onClick={() => onResolve(item.id)}
          className="self-start rounded-md border border-border px-3.5 py-2 text-xs transition-colors hover:border-emerald-600/50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Mark resolved
        </button>
      )}
    </div>
  );
}
