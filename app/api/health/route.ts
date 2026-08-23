import { NextResponse } from 'next/server';
import { isDurable } from '@/lib/cases/persistence';

/**
 * Configuration check for a deployed instance.
 *
 * Reports what is wired without ever echoing a secret — only whether each
 * value is present. Hitting this after a deploy answers "why is nothing
 * happening" faster than reading logs.
 */

export const dynamic = 'force-dynamic';

/**
 * Proves the MCP endpoint is reachable from the public internet by calling our
 * own advertised URL and coming back in through the tunnel. If this round trip
 * works, Agora's cloud can reach the tools too — which is the failure that
 * otherwise shows up only as an agent that mysteriously stops using them.
 */
async function checkMcpReachable(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { result?: { tools?: unknown[] } };
    return (body.result?.tools?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  const mcpBase = process.env.MCP_PUBLIC_URL;

  const checks = {
    agoraAppId: Boolean(process.env.NEXT_PUBLIC_AGORA_APP_ID),
    agoraAppCertificate: Boolean(process.env.NEXT_AGORA_APP_CERTIFICATE),
    // Without this the agent starts but has no tools at all.
    mcpPublicUrl: mcpBase ? `${mcpBase.replace(/\/$/, '')}/api/mcp` : null,
    // False on a serverless host means cases vanish between requests.
    durableCaseStore: isDurable(),
    sheetsWebhook: Boolean(process.env.SHEETS_WEBHOOK_URL),
    calendarWebhook: Boolean(process.env.CALENDAR_WEBHOOK_URL),
    ttsVoice: process.env.NEXT_TTS_VOICE_ID ?? 'hindi_male_1_v2 (default)',
  };

  const mcpReachable = mcpBase ? await checkMcpReachable(mcpBase) : false;
  const ready = checks.agoraAppId && checks.agoraAppCertificate;

  return NextResponse.json(
    {
      ready,
      checks: { ...checks, mcpReachable },
      warnings: [
        !checks.mcpPublicUrl &&
          'MCP_PUBLIC_URL is unset — the agent will run without tools.',
        checks.mcpPublicUrl &&
          !mcpReachable &&
          'MCP endpoint is not reachable from the internet — the tunnel is probably down or its URL changed. The agent will start but every tool call will fail.',
        // Only a problem where the filesystem is read-only; running locally
        // the JSON file is the better store, so this would just be noise.
        process.env.VERCEL &&
          !checks.durableCaseStore &&
          'No Redis configured — on this host cases will not survive a cold start.',
      ].filter(Boolean),
    },
    { status: ready ? 200 : 503 },
  );
}
