'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import LandingPage from '@/components/LandingPage';
import { DEFAULT_VOICE_ID, VOICES } from '@/lib/agent/voices';

/**
 * Call panel for the dashboard.
 *
 * Portalled to <body> on purpose: the dashboard pins a light token set, and
 * the call UI has its own palette. Rendering outside that wrapper lets each
 * keep its own theme instead of one bleeding into the other.
 */
export default function CallModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [ending, setEnding] = useState(false);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);

  useEffect(() => setMounted(true), []);

  /**
   * Closing hangs up properly: the agent is stopped server-side before the
   * panel unmounts, instead of being left to expire on its idle timeout.
   */
  const requestClose = useCallback(() => setEnding(true), []);

  // A hung stop request must never trap the user in the panel.
  useEffect(() => {
    if (!ending) return;
    const bail = setTimeout(onClose, 3000);
    return () => clearTimeout(bail);
  }, [ending, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);

    // Stop the queue behind the panel from scrolling under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Talk to Kisan Saathi"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close call"
        onClick={requestClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
      />

      <div className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-medium text-foreground">
              Talk to Kisan Saathi
            </span>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              cases appear in the queue behind this window, live
            </span>
          </div>

          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Voice</span>
            <select
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label} — {voice.note}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={requestClose}
            disabled={ending}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ending ? 'Ending call…' : 'Close'}
            {!ending && (
              <span className="ml-2 hidden font-mono opacity-60 sm:inline">
                esc
              </span>
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <LandingPage
            embedded
            endSignal={ending ? 1 : 0}
            onEnded={onClose}
            voiceId={voiceId}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
