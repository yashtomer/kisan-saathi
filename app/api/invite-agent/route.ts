import { NextRequest, NextResponse } from 'next/server';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from 'agora-agents';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import {
  buildSystemPrompt,
  FAILURE_MESSAGE,
  FILLER_PHRASES,
  GREETING,
  SILENCE_PROMPT,
} from '@/lib/agent/prompt';
import { fetchWeatherContext } from '@/lib/agent/weather';
import { resolveVoiceId } from '@/lib/agent/voices';

// agentUid identifies the AI in the RTC channel and shares its default with the client.
const agentUid = String(DEFAULT_AGENT_UID);

// Fallback when the caller does not pick one. See lib/agent/voices.ts for the
// offered list; an English-tuned voice reading Hindi is the fastest way to
// lose a rural user, so the default is a Hindi voice.
const FALLBACK_VOICE_ID = process.env.NEXT_TTS_VOICE_ID;

// Agora's cloud calls our tools over the public internet, so this must be a
// publicly reachable origin — a tunnel in development, the deployed URL in
// production. Without it the agent runs tool-less and can only talk.
const MCP_BASE_URL = process.env.MCP_PUBLIC_URL;

function buildMcpServers(channel: string) {
  if (!MCP_BASE_URL) {
    console.warn('[agent] MCP_PUBLIC_URL not set — starting agent without tools');
    return undefined;
  }

  return [
    {
      // Name accepts only letters and numbers, max 48 characters.
      name: 'kisansaathitools',
      transport: 'streamable_http',
      // The channel travels on the URL so tool calls can be tied back to the
      // call that produced them; MCP itself carries no session identity.
      endpoint: `${MCP_BASE_URL.replace(/\/$/, '')}/api/mcp?channel=${encodeURIComponent(channel)}`,
      // Explicit allowlist: the agent may only invoke what we intend it to.
      allowed_tools: [
        'get_weather',
        'search_advisory',
        'create_case',
        'escalate_to_expert',
        'book_expert_callback',
      ],
      // A farmer is waiting on the line; give up rather than hold dead air.
      timeout_ms: 8000,
    },
  ];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse request ---

    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name, farmer, voice_id } = body;

    // Never pass a client-supplied id straight to the vendor: unknown values
    // fall back to the default rather than failing the call.
    const voiceId = resolveVoiceId(voice_id ?? FALLBACK_VOICE_ID);

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    // --- 2. Enrich with live conditions ---

    // Real weather for the farmer's area, folded into the prompt before the
    // agent speaks. Returns null on timeout or an unknown place name, in which
    // case the agent simply runs without it.
    const weather = farmer?.village
      ? await fetchWeatherContext(farmer.village)
      : null;

    // --- 3. Build and start the agent ---

    // area: AP keeps the media path inside Asia-Pacific, which matters when the
    // caller is on rural Indian mobile data.
    const client = new AgoraClient({
      area: Area.AP,
      appId,
      appCertificate,
    });

    // Pipeline: Deepgram (reseller) STT → OpenAI (reseller) LLM → MiniMax (reseller) TTS.
    // Omit vendor API keys for supported models — AgentKit infers reseller presets on start.
    const agent = new Agent({
      client,
      // VAD controls how the agent detects the start and end of a user's turn.
      // Tuned for field conditions rather than a quiet desk: farmers pause
      // mid-thought, and tractors, cattle and wind should not steal the turn.
      turnDetection: {
        config: {
          speech_threshold: 0.6, // higher bar so ambient noise is not "speech"
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 240, // brief noise won't cut the agent off
              prefix_padding_ms: 300, // audio captured before speech is detected
            },
          },
          // Semantic end-of-speech rather than a silence timer. A farmer
          // pausing to look at a leaf, or saying "एक मिनट रुको", is not
          // finished talking — a fixed timeout cuts him off mid-thought.
          end_of_speech: {
            mode: 'semantic',
            semantic_config: {
              silence_duration_ms: 720,
              max_wait_ms: 2500, // fall back to VAD behaviour rather than hang
              pause_state_enabled: true, // "hold on" means wait, not respond
            },
          },
        },
      },
      // Selective Attention Locking: the agent locks onto the farmer's voice
      // and suppresses roughly 95% of other human voices and ambient noise.
      // Field calls happen with family, traders and machinery in earshot, and
      // without this every nearby conversation lands in the transcript.
      sal: { sal_mode: 'locking' },
      // Barge-in. Keyword triggers are additive insurance for the case the
      // farmer is shouting over a running tractor and start-of-speech
      // detection is fighting the noise floor.
      interruption: {
        enable: true,
        mode: 'start_of_speech',
        keywords_config: {
          trigger_keywords: ['रुको', 'रुकिए', 'सुनो', 'सुनिए', 'अरे', 'stop', 'wait', 'listen'],
        },
      },
      // Spoken while the LLM is still thinking, so a pause never sounds like a
      // dropped call — the most common reason a rural caller hangs up.
      fillerWords: {
        trigger: {
          mode: 'fixed_time',
          fixed_time_config: { response_wait_ms: 700 },
        },
        content: {
          mode: 'static',
          static_config: {
            phrases: [...FILLER_PHRASES],
            selection_rule: 'shuffle',
          },
        },
      },
      // RTM is required for transcript events in the browser client.
      // enable_tools is required for MCP tool invocation.
      advancedFeatures: { enable_rtm: true, enable_tools: true },
      parameters: {
        // web client → ultra-low-latency chorus profile
        audio_scenario: 'chorus',
        data_channel: 'rtm',
        enable_error_message: true,
        enable_metrics: true,
        // Re-engage rather than sit in silence when the farmer stops talking.
        silence_config: {
          // Longer than the slowest tool-assisted turn, so the agent never
          // talks over its own thinking.
          timeout_ms: 20000,
          action: 'speak',
          content: SILENCE_PROMPT,
        },
      },
    })
      .withStt(
        new DeepgramSTT({
          model: 'nova-3',
          // 'multi' lets one stream carry Hindi and English, including
          // code-switching mid-sentence, without asking the farmer to pick.
          language: 'multi',
        }),
      )
      .withLlm(
        new OpenAI({
          // gpt-4.1-mini kept choosing to ask another question instead of
          // calling a tool; gpt-5-mini follows the tool instructions far more
          // reliably, which matters more here than its slightly higher latency.
          model: 'gpt-5-mini',
          systemMessages: [
            { role: 'system', content: buildSystemPrompt(farmer, weather) },
          ],
          greetingMessage: GREETING,
          failureMessage: FAILURE_MESSAGE,
          // Triage spans many turns and the agent must never re-ask something
          // already answered, so history is deeper than the quickstart default.
          maxHistory: 40,
          mcpServers: buildMcpServers(channel_name),
          // GPT-5 models reject `max_tokens` (they want `max_completion_tokens`)
          // and refuse any temperature or top_p other than the default. Passing
          // the GPT-4-era params here returns 400 on every turn, which surfaces
          // to the farmer as the failure message and nothing else.
          params: {
            max_completion_tokens: 1024,
            // GPT-5 models think before answering, which cost ~7s to first
            // token — unusable on a call. Capping the reasoning budget keeps
            // the tool-calling reliability without the wait.
            reasoning_effort: 'low',
          },
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId,
        }),
      );

    // remoteUids restricts the agent to only process audio from this user
    const session = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 60, // rural callers pause; 30s hung up on them too eagerly
      expiresIn: ExpiresIn.hours(1),
      debug: false, // enable debug to show restful API calls in the console
    });

    const agentId = await session.start();
    console.log(
      `[agent] started ${agentId} on channel ${channel_name}` +
        `${weather ? ' (weather loaded)' : ''}` +
        `${MCP_BASE_URL ? ' (tools enabled)' : ' (NO TOOLS)'}` +
        ` voice=${voiceId}`,
    );

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
