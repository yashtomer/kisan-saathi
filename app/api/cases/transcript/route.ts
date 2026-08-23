import { NextRequest, NextResponse } from 'next/server';
import { attachTranscript, type TranscriptTurn } from '@/lib/cases/store';

/**
 * Attaches a call's transcript to the cases it produced.
 *
 * The browser owns the transcript — it arrives there over RTM — while the case
 * is created server-side by a tool call. The channel is the only thing both
 * sides know, so it is the join key.
 */

export const dynamic = 'force-dynamic';

/** A long call should not be able to bloat the store without limit. */
const MAX_TURNS = 200;
const MAX_TEXT = 2000;

type Body = {
  channel?: string;
  turns?: Array<{ speaker?: string; text?: string; at?: string }>;
};

export async function POST(request: NextRequest) {
  let body: Body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { channel, turns } = body;

  if (!channel || !Array.isArray(turns)) {
    return NextResponse.json(
      { error: 'channel and turns are required' },
      { status: 400 },
    );
  }

  const cleaned: TranscriptTurn[] = turns
    .slice(-MAX_TURNS)
    .map((turn): TranscriptTurn => ({
      // Anything that is not explicitly the agent is treated as the farmer,
      // so an unexpected speaker value can never be attributed to the agent.
      speaker: turn.speaker === 'agent' ? 'agent' : 'farmer',
      text: String(turn.text ?? '').slice(0, MAX_TEXT),
      at: typeof turn.at === 'string' ? turn.at : new Date().toISOString(),
    }))
    .filter((turn) => turn.text.length > 0);

  const attached = await attachTranscript(channel, cleaned);

  // Zero attached is normal: the agent may not have created a case in this
  // call, so this is information rather than an error.
  return NextResponse.json({ attached, turns: cleaned.length });
}
