import type { ToolDefinition } from './protocol';
import { searchAdvisory, SUPPORTED_CROPS } from '@/lib/agent/advisory';
import { fetchWeatherContext } from '@/lib/agent/weather';
import { createCase, escalateCase, getCase, setCaseAppointment } from '@/lib/cases/store';
import { pushCaseToSheet } from '@/lib/cases/sheets';
import {
  bookCallback,
  describeSlotInHindi,
  nextCallbackSlot,
} from '@/lib/cases/calendar';

/**
 * Tools the agent calls mid-conversation.
 *
 * Every handler returns plain prose, not JSON: the text goes back into the
 * LLM's context and is spoken aloud moments later. Descriptions are written
 * for the model — they say when to call the tool, not just what it does.
 */

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

export const TOOLS: ToolDefinition[] = [
  {
    name: 'ping',
    description:
      'Connectivity check. Call this only if the user explicitly asks you to test the tools.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: [],
    },
    handler: async (args) => {
      console.log(`[mcp] PING RECEIVED FROM AGORA — ${asString(args.message)}`);
      return `pong${args.message ? `: ${asString(args.message)}` : ''}`;
    },
  },

  {
    name: 'get_weather',
    description:
      'Get current weather and recent rainfall for a village, town or district in India. Call this when the problem could be weather related — fungal spread, wilting, pest outbreak — or before you discuss spraying, because rain washes spray away. IMPORTANT: pass the place name in English letters using its normal map spelling — "Nashik", "Wardha", "Ludhiana", "Nagpur" — even when the farmer said it in Hindi. Devanagari names do not resolve reliably.',
    inputSchema: {
      type: 'object',
      properties: {
        place: {
          type: 'string',
          description:
            'Village, town or district name in English letters, for example Nashik, Wardha or Ludhiana. Never pass Devanagari.',
        },
      },
      required: ['place'],
    },
    handler: async (args) => {
      const place = asString(args.place);
      if (!place) return 'No place name was provided, so weather could not be checked.';

      const summary = await fetchWeatherContext(place);
      return (
        summary ??
        `Weather for "${place}" could not be retrieved. Tell the farmer you could not check the weather right now, and continue without it.`
      );
    },
  },

  {
    name: 'search_advisory',
    description:
      'Look up likely causes for what the farmer is describing. Call this once you know the crop and the main symptom, BEFORE offering any diagnosis. Returns candidate conditions with a question that separates look-alikes — ask that question rather than guessing.',
    inputSchema: {
      type: 'object',
      properties: {
        crop: {
          type: 'string',
          description: `Crop name in English, for example tomato, cotton, wheat or paddy. Covered crops: ${SUPPORTED_CROPS.join(', ')}.`,
        },
        symptoms: {
          type: 'string',
          description:
            'Everything the farmer has described so far, in his own words. Include colour, plant part, and spread.',
        },
      },
      required: ['crop', 'symptoms'],
    },
    handler: async (args) => {
      const crop = asString(args.crop);
      const symptoms = asString(args.symptoms);
      const matches = searchAdvisory(crop, symptoms);

      if (matches.length === 0) {
        return `No entry matched "${crop}" with those symptoms. The knowledge base only covers ${SUPPORTED_CROPS.join(', ')}. Say honestly that you are not sure, ask one more clarifying question, and escalate to an expert.`;
      }

      const weak = matches[0].matchScore < 4;
      const lines = matches.map((match, index) =>
        [
          `${index + 1}. ${match.condition} (${match.conditionEnglish}) — severity ${match.severity}`,
          `   Favoured by: ${match.favouredBy}`,
          `   Ask next: ${match.distinguishingQuestion}`,
          `   Treatment category (never state a dose): ${match.treatmentCategory}`,
        ].join('\n'),
      );

      const preamble = weak
        ? 'WEAK MATCH — treat these as possibilities only, and say clearly that you are not certain.'
        : 'Candidate causes, most likely first. Do not present the first one as certain until you have asked the distinguishing question.';

      return `${preamble}\n\n${lines.join('\n\n')}`;
    },
  },

  {
    name: 'create_case',
    description:
      'Save a structured case record of this conversation so a human agronomist can act on it. Call this once you have gathered the crop and symptoms and have decided the farmer needs expert help. Fill every field you actually know from the conversation — never invent values. After calling this, tell the farmer his case number.',
    inputSchema: {
      type: 'object',
      properties: {
        crop: { type: 'string', description: 'The crop affected.' },
        symptoms: {
          type: 'string',
          description: "Full description of the problem in the farmer's own words.",
        },
        farmer_name: { type: 'string' },
        village: { type: 'string' },
        duration_days: { type: 'string', description: 'How long it has been happening.' },
        affected_area: { type: 'string', description: 'How much of the field is affected.' },
        spreading: { type: 'string', description: 'Whether it is spreading, and how fast.' },
        recent_treatment: { type: 'string', description: 'Anything sprayed or applied recently.' },
        suspected_cause: { type: 'string', description: 'Your working hypothesis, if any.' },
        confidence: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'How confident you actually are. Be honest — the expert relies on this.',
        },
        weather_context: { type: 'string', description: 'Relevant weather, if you checked it.' },
        language: { type: 'string', description: 'Language the farmer spoke, e.g. Hindi, Hinglish.' },
      },
      required: ['crop', 'symptoms'],
    },
    handler: async (args) => {
      const record = await createCase({
        crop: asString(args.crop, 'unknown'),
        symptoms: asString(args.symptoms),
        farmerName: asString(args.farmer_name) || undefined,
        village: asString(args.village) || undefined,
        durationDays: asString(args.duration_days) || undefined,
        affectedArea: asString(args.affected_area) || undefined,
        spreading: asString(args.spreading) || undefined,
        recentTreatment: asString(args.recent_treatment) || undefined,
        suspectedCause: asString(args.suspected_cause) || undefined,
        confidence: ['low', 'medium', 'high'].includes(asString(args.confidence))
          ? (asString(args.confidence) as 'low' | 'medium' | 'high')
          : undefined,
        weatherContext: asString(args.weather_context) || undefined,
        language: asString(args.language) || undefined,
      });

      const sheet = await pushCaseToSheet(record);
      console.log(
        `[mcp] case ${record.id} created (sheet: ${sheet.synced ? 'synced' : sheet.reason})`,
      );

      return `Case saved with number ${record.id}. Read this number to the farmer slowly, digit by digit, and tell him an agronomist will call him back and that he will not need to explain the problem again.`;
    },
  },

  {
    name: 'escalate_to_expert',
    description:
      'Hand a saved case to a human agronomist for review. Call this immediately after create_case whenever you are unsure, the damage is widespread, a chemical dose is needed, or the farmer asked for a person. Use urgency "urgent" for fast-spreading damage, crop loss, livestock illness or any human pesticide exposure.',
    inputSchema: {
      type: 'object',
      properties: {
        case_id: {
          type: 'string',
          description: 'The case number returned by create_case, for example KS4821.',
        },
        reason: {
          type: 'string',
          description: 'Why this needs a human, in one sentence an agronomist can act on.',
        },
        urgency: { type: 'string', enum: ['routine', 'urgent'] },
      },
      required: ['case_id', 'reason'],
    },
    handler: async (args) => {
      const caseId = asString(args.case_id);
      const urgency = asString(args.urgency) === 'urgent' ? 'urgent' : 'routine';
      const record = await escalateCase(caseId, asString(args.reason), urgency);

      if (!record) {
        return `No case found with number ${caseId}. Call create_case first, then escalate using the number it returns.`;
      }

      console.log(`[mcp] case ${record.id} escalated (${urgency})`);
      return `Case ${record.id} is now with a human agronomist, marked ${urgency}. Next, call book_expert_callback so the farmer gets an actual time instead of a vague promise.`;
    },
  },

  {
    name: 'book_expert_callback',
    description:
      'Book a callback appointment with the agronomist and put it on his calendar. Call this immediately after escalate_to_expert. It returns a specific time in Hindi — say that time to the farmer so he knows exactly when his phone will ring.',
    inputSchema: {
      type: 'object',
      properties: {
        case_id: {
          type: 'string',
          description: 'The case number, for example KS4821.',
        },
      },
      required: ['case_id'],
    },
    handler: async (args) => {
      const caseId = asString(args.case_id);
      const record = await getCase(caseId);

      if (!record) {
        return `No case found with number ${caseId}. Call create_case first.`;
      }

      const slot = nextCallbackSlot(record.urgency);
      const booking = await bookCallback(record, slot);
      await setCaseAppointment(record.id, slot.toISOString(), booking.link);

      const spoken = describeSlotInHindi(slot);
      console.log(
        `[mcp] case ${record.id} callback ${slot.toISOString()} (calendar: ${
          booking.booked ? 'created' : booking.reason
        })`,
      );

      return `Callback booked for case ${record.id}. Tell the farmer, in his own language, that the agronomist will call him ${spoken}. Say that time clearly and repeat his case number once.`;
    },
  },
];
