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

export function GET() {
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

  const ready = checks.agoraAppId && checks.agoraAppCertificate;

  return NextResponse.json(
    {
      ready,
      checks,
      warnings: [
        !checks.mcpPublicUrl &&
          'MCP_PUBLIC_URL is unset — the agent will run without tools.',
        !checks.durableCaseStore &&
          'No Redis configured — fine locally, but cases will not persist on serverless.',
      ].filter(Boolean),
    },
    { status: ready ? 200 : 503 },
  );
}
