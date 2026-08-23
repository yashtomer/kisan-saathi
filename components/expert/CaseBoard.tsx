'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { FarmerCase } from '@/lib/cases/store';
import CallModal from './CallModal';
import CaseDetail from './CaseDetail';

/**
 * Agronomist's triage board.
 *
 * Master–detail: the queue is scanned on the left, the full handover record
 * sits open on the right. On narrow screens the record expands under the row
 * instead, since there is no room for two columns.
 *
 * Polls every four seconds — during a live call a case must appear on screen
 * while the farmer is still on the line.
 */

const POLL_MS = 4000;

type Filter = 'all' | 'escalated' | 'open' | 'resolved';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'escalated', label: 'Needs expert' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Tuned for a light ground: 600/700 steps hold contrast on warm paper.
const STATUS_STYLE: Record<string, string> = {
  escalated: 'text-amber-700 border-amber-600/35 bg-amber-500/10',
  open: 'text-sky-700 border-sky-600/35 bg-sky-500/10',
  resolved: 'text-emerald-700 border-emerald-600/35 bg-emerald-500/10',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'agent unsure',
  medium: 'agent fairly sure',
  high: 'agent confident',
};

/** Low confidence is the signal an expert most needs; it gets weight. */
const CONFIDENCE_STYLE: Record<string, string> = {
  low: 'text-amber-700',
  medium: 'text-muted-foreground',
  high: 'text-emerald-700',
};

function Stat({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'sky' | 'emerald';
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    amber: 'text-amber-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-baseline gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card hover:border-primary/25'
      }`}
    >
      <span
        className={`font-[family-name:var(--font-display)] text-xl font-bold tabular-nums leading-none ${tones[tone]}`}
      >
        {value}
      </span>
      <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </button>
  );
}

export default function CaseBoard() {
  const [cases, setCases] = useState<FarmerCase[]>([]);
  const [filter, setFilter] = useState<Filter>('escalated');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(true);
  const [callOpen, setCallOpen] = useState(false);
  const [toolsReachable, setToolsReachable] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/cases', { cache: 'no-store' });
      const data = (await response.json()) as { cases: FarmerCase[] };
      setCases(data.cases ?? []);
      setLive(true);
    } catch {
      // Keep showing the last good data rather than blanking mid-demo.
      setLive(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  /**
   * Tools live behind a public URL that Agora's cloud calls. When that URL
   * goes stale — a tunnel restarted, a laptop slept — the agent still answers
   * but silently stops using its tools, which is a miserable thing to discover
   * mid-demo. Check before anyone picks up the phone.
   */
  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const body = (await response.json()) as {
          checks?: { mcpReachable?: boolean };
        };
        setToolsReachable(body.checks?.mcpReachable !== false);
      } catch {
        setToolsReachable(true); // never cry wolf on a transient fetch failure
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(
    () => ({
      all: cases.length,
      escalated: cases.filter((c) => c.status === 'escalated').length,
      open: cases.filter((c) => c.status === 'open').length,
      resolved: cases.filter((c) => c.status === 'resolved').length,
      urgent: cases.filter(
        (c) => c.urgency === 'urgent' && c.status !== 'resolved',
      ).length,
    }),
    [cases],
  );

  const visible = useMemo(
    () =>
      filter === 'all' ? cases : cases.filter((item) => item.status === filter),
    [cases, filter],
  );

  // On a wide screen the detail pane would otherwise sit empty, so open the
  // top case by default. Narrow screens stay collapsed — there is no pane.
  useEffect(() => {
    if (selectedId || visible.length === 0) return;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const selected = cases.find((item) => item.id === selectedId) ?? null;

  async function resolve(id: string) {
    setCases((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'resolved' } : item,
      ),
    );
    await fetch('/api/cases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'resolved' }),
    });
    load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22V9" />
                <path d="M12 13c0-3 2-6 5.5-6.5C17 10 15 13 12 13z" />
                <path d="M12 17c0-3-2-6-5.5-6.5C7 14 9 17 12 17z" />
              </svg>
            </span>
            <div className="flex flex-col">
              <span className="font-[family-name:var(--font-display)] text-lg font-bold leading-tight tracking-tight">
                Kisan Saathi
              </span>
              <span className="font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Agronomist case queue
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 font-[family-name:var(--font-data)] text-[10px] text-muted-foreground">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  live ? 'animate-pulse bg-emerald-600' : 'bg-destructive'
                }`}
              />
              {live ? 'live' : 'reconnecting'}
            </span>

            <Link
              href="/tech"
              className="rounded-md border border-pink-300 bg-pink-50 px-3 py-2 text-xs font-medium text-pink-700 transition-colors hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
            >
              How this works
            </Link>

            <button
              type="button"
              onClick={() => setCallOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <svg
                aria-hidden="true"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Call the agent
            </button>
          </div>
        </div>
      </header>

      {!toolsReachable && (
        <div className="border-b border-destructive/30 bg-destructive/10">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-xs text-destructive sm:px-8">
            <strong className="font-semibold">Tools are unreachable.</strong>
            <span>
              The agent will still talk, but it cannot check weather, look up
              advisories, or save a case. Restart the tunnel and update
              MCP_PUBLIC_URL.
            </span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1400px] px-5 py-5 sm:px-8">
        {/* Counts double as filters — the number and the way to act on it are
            the same control, rather than two rows doing one job. */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <Stat
            label="Needs expert"
            value={counts.escalated}
            tone="amber"
            active={filter === 'escalated'}
            onClick={() => setFilter('escalated')}
          />
          <Stat
            label="Open"
            value={counts.open}
            tone="sky"
            active={filter === 'open'}
            onClick={() => setFilter('open')}
          />
          <Stat
            label="Resolved"
            value={counts.resolved}
            tone="emerald"
            active={filter === 'resolved'}
            onClick={() => setFilter('resolved')}
          />

          {counts.urgent > 0 && (
            <span className="flex items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-amber-600"
              />
              {counts.urgent} urgent waiting
            </span>
          )}

          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`ml-auto rounded-full border px-3.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === 'all'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            Show all
            <span className="ml-2 font-[family-name:var(--font-data)] tabular-nums opacity-70">
              {counts.all}
            </span>
          </button>
        </div>

        {!loaded ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading cases…
          </p>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
            <p className="font-[family-name:var(--font-display)] text-base font-medium">
              No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}{' '}
              cases
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Cases appear the moment the agent saves one during a call. Call
              the agent, describe a crop problem, and watch this page fill in
              while you are still talking.
            </p>
            <button
              type="button"
              onClick={() => setCallOpen(true)}
              className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Call the agent
            </button>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_460px]">
            {/* Queue */}
            <ul className="flex flex-col gap-2">
              {visible.map((item) => {
                const urgent = item.urgency === 'urgent';
                const active = selectedId === item.id;
                return (
                  <li key={item.id}>
                    <article
                      className={`overflow-hidden rounded-xl border bg-card transition-all ${
                        active
                          ? 'border-primary/40 shadow-sm ring-1 ring-primary/15'
                          : 'border-border hover:border-primary/25'
                      } ${
                        urgent
                          ? 'border-l-[3px] border-l-amber-600'
                          : 'border-l-[3px] border-l-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedId(active && window.innerWidth < 1024 ? null : item.id)
                        }
                        aria-expanded={active}
                        className="flex w-full flex-col gap-1.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="font-[family-name:var(--font-data)] text-sm font-semibold tabular-nums">
                            {item.id}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 font-[family-name:var(--font-data)] text-[10px] uppercase tracking-wider ${
                              STATUS_STYLE[item.status] ?? ''
                            }`}
                          >
                            {item.status}
                          </span>
                          {urgent && (
                            <span className="rounded-full bg-amber-600/12 px-2 py-0.5 font-[family-name:var(--font-data)] text-[10px] uppercase tracking-wider text-amber-700">
                              urgent
                            </span>
                          )}
                          <span className="text-sm">
                            <span className="font-medium capitalize">
                              {item.crop}
                            </span>
                            {item.village && (
                              <span className="text-muted-foreground">
                                {' '}
                                · {item.village}
                              </span>
                            )}
                            {item.farmerName && (
                              <span className="text-muted-foreground">
                                {' '}
                                · {item.farmerName}
                              </span>
                            )}
                          </span>

                          <span className="ml-auto flex items-center gap-3">
                            {item.confidence && (
                              <span
                                className={`hidden font-[family-name:var(--font-data)] text-[11px] sm:inline ${
                                  CONFIDENCE_STYLE[item.confidence] ?? ''
                                }`}
                              >
                                {CONFIDENCE_LABEL[item.confidence]}
                              </span>
                            )}
                            <span className="font-[family-name:var(--font-data)] text-[11px] tabular-nums text-muted-foreground">
                              {timeAgo(item.createdAt)}
                            </span>
                          </span>
                        </div>

                        {/* A line of what he actually said, so the queue is
                            readable without opening every case. */}
                        <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
                          {item.symptoms}
                        </p>

                        {item.appointmentAt && (
                          <p className="font-[family-name:var(--font-data)] text-[10px] text-primary">
                            callback{' '}
                            {new Date(item.appointmentAt).toLocaleString(
                              'en-IN',
                              {
                                weekday: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata',
                              },
                            )}
                          </p>
                        )}
                      </button>

                      {/* Narrow screens have no side pane, so open inline. */}
                      {active && (
                        <div className="border-t border-border bg-background/40 px-4 py-4 lg:hidden">
                          <CaseDetail item={item} onResolve={resolve} />
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>

            {/* Detail pane — wide screens only */}
            <aside className="hidden lg:sticky lg:top-5 lg:block">
              {selected ? (
                <div className="rounded-xl border border-border bg-card px-5 py-5">
                  <CaseDetail item={selected} onResolve={resolve} />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-5 py-16 text-center text-sm text-muted-foreground">
                  Select a case to see everything the farmer said.
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {callOpen && <CallModal onClose={() => setCallOpen(false)} />}
    </div>
  );
}
