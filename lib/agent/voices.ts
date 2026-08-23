/**
 * Voices the agent can speak with.
 *
 * MiniMax ships exactly three Hindi voices on the Agora-managed plan, so this
 * is the whole menu rather than a selection from a larger set. The English
 * voice is included for callers who speak English throughout — a Hindi voice
 * reading English is intelligible, but it is not what an English speaker
 * expects to hear.
 *
 * Ids are validated against this list on the server: an unchecked voice id
 * from the client would let a caller point the pipeline at any vendor voice.
 */

export type Voice = {
  id: string;
  /** Shown in the picker. */
  label: string;
  /** Why someone would pick this one. */
  note: string;
  language: 'hindi' | 'english';
};

export const VOICES: Voice[] = [
  {
    id: 'hindi_male_1_v2',
    label: 'Trustworthy Advisor',
    note: 'Male, steady — the default',
    language: 'hindi',
  },
  {
    id: 'hindi_female_2_v1',
    label: 'Tranquil Woman',
    note: 'Female, calm and unhurried',
    language: 'hindi',
  },
  {
    id: 'hindi_female_1_v2',
    label: 'News Anchor',
    note: 'Female, crisp and clear',
    language: 'hindi',
  },
  {
    id: 'English_captivating_female1',
    label: 'English speaker',
    note: 'For callers who speak English throughout',
    language: 'english',
  },
];

export const DEFAULT_VOICE_ID = VOICES[0].id;

/**
 * Returns the requested voice when it is one we offer, and the default
 * otherwise — an unknown id is treated as absent rather than as an error,
 * because a farmer waiting on the line should never hear a failure over a
 * cosmetic setting.
 */
export function resolveVoiceId(requested?: string): string {
  if (!requested) return DEFAULT_VOICE_ID;
  return VOICES.some((voice) => voice.id === requested)
    ? requested
    : DEFAULT_VOICE_ID;
}
