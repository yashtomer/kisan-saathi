import { NextRequest, NextResponse } from 'next/server';
import { handleMcpMessage } from '@/lib/mcp/protocol';
import { TOOLS } from '@/lib/mcp/tools';

/**
 * MCP endpoint the Agora Conversational AI Engine calls to invoke tools.
 *
 * Must be reachable from the public internet — Agora's cloud makes these
 * requests, not the browser. In development that means a tunnel; see README.
 */

// Tools reach the network and mutate the case store, so nothing here is static.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 },
    );
  }

  // Which call this is. Set when the agent is configured; absent for manual
  // curl testing, which simply produces cases with no transcript attached.
  const channel = request.nextUrl.searchParams.get('channel') ?? undefined;

  // The spec permits a batch; the engine sends single messages, but handling
  // both costs one line.
  const messages = Array.isArray(body) ? body : [body];
  const responses = [];

  for (const message of messages) {
    const response = await handleMcpMessage(message, TOOLS, { channel });
    if (response) responses.push(response);
  }

  // Notifications only: acknowledge with no content.
  if (responses.length === 0) return new NextResponse(null, { status: 202 });

  return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * The engine may probe for a server-initiated SSE stream. We are
 * request/response only, and 405 is the spec's way of saying so.
 */
export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
