import type { FarmerCase } from './store';

/**
 * Callback appointments for escalated cases.
 *
 * Two layers, so the feature never hard-fails:
 *  1. A Google Apps Script web app (CALENDAR_WEBHOOK_URL) creates a real event
 *     on the agronomist's calendar — no OAuth, no service account.
 *  2. A Google Calendar template link is always generated, so even with no
 *     webhook the dashboard can offer "add to calendar" in one click.
 *
 * Slots are computed in IST because every user of this system is in India.
 */

const TIMEOUT_MS = 4000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Agronomists take calls between these hours, IST. */
const DAY_STARTS_AT = 9;
const DAY_ENDS_AT = 18;
const CALL_MINUTES = 30;

const pad = (value: number) => String(value).padStart(2, '0');

/** Reads clock fields as they would appear on a wall clock in India. */
function istParts(utcMs: number) {
  const shifted = new Date(utcMs + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Builds a UTC timestamp from IST wall-clock fields. */
function istToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS;
}

/**
 * Picks the next sensible callback slot.
 *
 * Urgent cases get seen within two hours if that lands inside working hours;
 * everything else goes to the next morning. A farmer told "tomorrow at ten"
 * can plan his day around it, which a vague "someone will call" cannot.
 */
export function nextCallbackSlot(
  urgency: FarmerCase['urgency'],
  nowMs = Date.now(),
): Date {
  const soonest = urgency === 'urgent' ? nowMs + 2 * 60 * 60 * 1000 : nowMs;
  const { year, month, day, hour, minute } = istParts(soonest);

  // Urgent and still within the working day: round up to the next half hour.
  if (urgency === 'urgent' && hour >= DAY_STARTS_AT && hour < DAY_ENDS_AT) {
    const roundedMinute = minute <= 30 ? 30 : 0;
    const roundedHour = minute <= 30 ? hour : hour + 1;
    if (roundedHour < DAY_ENDS_AT) {
      return new Date(istToUtc(year, month, day, roundedHour, roundedMinute));
    }
  }

  // Before the day starts: take this morning. Otherwise, tomorrow morning.
  if (hour < DAY_STARTS_AT) {
    return new Date(istToUtc(year, month, day, DAY_STARTS_AT + 1));
  }

  return new Date(istToUtc(year, month, day + 1, DAY_STARTS_AT + 1));
}

/** "kal subah 10 baje" style phrasing the agent can say out loud. */
export function describeSlotInHindi(slot: Date, nowMs = Date.now()): string {
  const now = istParts(nowMs);
  const at = istParts(slot.getTime());
  const sameDay = now.year === at.year && now.month === at.month && now.day === at.day;
  const dayWord = sameDay ? 'आज' : 'कल';
  const period = at.hour < 12 ? 'सुबह' : at.hour < 17 ? 'दोपहर' : 'शाम';
  const hour12 = at.hour % 12 === 0 ? 12 : at.hour % 12;
  const minutePart = at.minute === 30 ? ' साढ़े' : '';
  return `${dayWord} ${period}${minutePart} ${hour12} बजे`;
}

const gcalStamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}00Z`;

function eventDetails(record: FarmerCase) {
  const title = `Kisan Saathi ${record.id} — ${record.crop}${
    record.farmerName ? ` · ${record.farmerName}` : ''
  }`;

  const description = [
    `Case ${record.id} raised by the Kisan Saathi voice agent.`,
    record.farmerName && `Farmer: ${record.farmerName}`,
    record.village && `Village: ${record.village}`,
    `Crop: ${record.crop}`,
    `Reported: ${record.symptoms}`,
    record.durationDays && `Duration: ${record.durationDays}`,
    record.affectedArea && `Area affected: ${record.affectedArea}`,
    record.spreading && `Spreading: ${record.spreading}`,
    record.recentTreatment && `Already applied: ${record.recentTreatment}`,
    record.suspectedCause && `Agent's hypothesis: ${record.suspectedCause}`,
    record.confidence && `Agent confidence: ${record.confidence}`,
    record.weatherContext && `Weather: ${record.weatherContext}`,
    record.escalationReason && `Escalated because: ${record.escalationReason}`,
    '',
    'The farmer has already explained all of this. Do not make him repeat it.',
  ]
    .filter(Boolean)
    .join('\n');

  return { title, description };
}

/**
 * A Google Calendar "add event" link. Requires no credentials and no setup —
 * the agronomist clicks it and saves the pre-filled event.
 */
export function buildCalendarLink(record: FarmerCase, slot: Date): string {
  const end = new Date(slot.getTime() + CALL_MINUTES * 60 * 1000);
  const { title, description } = eventDetails(record);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${gcalStamp(slot)}/${gcalStamp(end)}`,
    details: description,
    ctz: 'Asia/Kolkata',
  });

  if (record.village) params.set('location', record.village);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export type BookingResult = {
  slot: Date;
  /** True only when a real calendar event was created. */
  booked: boolean;
  link: string;
  reason?: string;
};

/**
 * Books the callback. Falls back to link-only when no webhook is configured or
 * the call fails — the farmer still gets a committed time either way.
 */
export async function bookCallback(
  record: FarmerCase,
  slot: Date,
): Promise<BookingResult> {
  const link = buildCalendarLink(record, slot);
  const endpoint = process.env.CALENDAR_WEBHOOK_URL;

  if (!endpoint) {
    return { slot, booked: false, link, reason: 'CALENDAR_WEBHOOK_URL not set' };
  }

  const { title, description } = eventDetails(record);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: record.id,
        title,
        description,
        location: record.village ?? '',
        startIso: slot.toISOString(),
        durationMinutes: CALL_MINUTES,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        slot,
        booked: false,
        link,
        reason: `calendar responded ${response.status}`,
      };
    }

    console.log(`[calendar] case ${record.id} booked for ${slot.toISOString()}`);
    return { slot, booked: true, link };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'calendar request failed';
    console.error(`[calendar] case ${record.id} not booked: ${reason}`);
    return { slot, booked: false, link, reason };
  }
}
