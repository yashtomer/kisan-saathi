import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

/** Pre-call details, so the agent never spends voice turns on the basics. */
export interface FarmerContext {
  name?: string;
  village?: string;
  crop?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  /** Optional: absent when the farmer skips the form or dials in by phone. */
  farmer?: FarmerContext;
  /** Voice id from the offered list; validated server-side. */
  voice_id?: string;
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
}
