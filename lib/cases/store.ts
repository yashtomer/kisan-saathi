import { readRaw, writeRaw } from './persistence';

/**
 * Farmer case store.
 *
 * Storage lives in `persistence.ts`: a JSON file locally, Redis when deployed
 * to a host with a read-only filesystem. This module only knows about cases.
 */

export type CaseStatus = 'open' | 'escalated' | 'resolved';

export type FarmerCase = {
  id: string;
  createdAt: string;
  status: CaseStatus;
  farmerName?: string;
  village?: string;
  crop: string;
  symptoms: string;
  durationDays?: string;
  affectedArea?: string;
  spreading?: string;
  recentTreatment?: string;
  suspectedCause?: string;
  /** The agent's own stated confidence — surfaced to the expert as-is. */
  confidence?: 'low' | 'medium' | 'high';
  weatherContext?: string;
  language?: string;
  urgency?: 'routine' | 'urgent';
  escalationReason?: string;
  escalatedAt?: string;
  /** Agreed callback time, in ISO. The farmer is told this out loud. */
  appointmentAt?: string;
  /** One-click "add to Google Calendar" link for the agronomist. */
  appointmentLink?: string;
};

const readAll = () => readRaw<FarmerCase[]>([]);
const writeAll = (cases: FarmerCase[]) => writeRaw(cases);

/**
 * Case IDs are spoken aloud to a farmer who may be writing them on his hand,
 * so they are short and read cleanly digit by digit in Hindi or English.
 */
function generateId(existing: FarmerCase[]): string {
  const used = new Set(existing.map((entry) => entry.id));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `KS${Math.floor(1000 + Math.random() * 9000)}`;
    if (!used.has(id)) return id;
  }
  return `KS${Date.now().toString().slice(-4)}`;
}

export async function createCase(
  input: Omit<FarmerCase, 'id' | 'createdAt' | 'status'>,
): Promise<FarmerCase> {
  const cases = await readAll();
  const record: FarmerCase = {
    ...input,
    id: generateId(cases),
    createdAt: new Date().toISOString(),
    status: 'open',
  };
  await writeAll([record, ...cases]);
  return record;
}

export async function escalateCase(
  id: string,
  reason: string,
  urgency: FarmerCase['urgency'] = 'routine',
): Promise<FarmerCase | null> {
  const cases = await readAll();
  const match = cases.find((entry) => entry.id === id.toUpperCase().trim());
  if (!match) return null;

  match.status = 'escalated';
  match.escalationReason = reason;
  match.urgency = urgency;
  match.escalatedAt = new Date().toISOString();

  await writeAll(cases);
  return match;
}

/** Used by the expert dashboard when an agronomist closes a case out. */
export async function setCaseStatus(
  id: string,
  status: CaseStatus,
): Promise<FarmerCase | null> {
  const cases = await readAll();
  const match = cases.find((entry) => entry.id === id.toUpperCase().trim());
  if (!match) return null;

  match.status = status;
  await writeAll(cases);
  return match;
}

/** Records the agreed callback slot once an appointment is booked. */
export async function setCaseAppointment(
  id: string,
  appointmentAt: string,
  appointmentLink: string,
): Promise<FarmerCase | null> {
  const cases = await readAll();
  const match = cases.find((entry) => entry.id === id.toUpperCase().trim());
  if (!match) return null;

  match.appointmentAt = appointmentAt;
  match.appointmentLink = appointmentLink;
  await writeAll(cases);
  return match;
}

export async function listCases(): Promise<FarmerCase[]> {
  return readAll();
}

export async function getCase(id: string): Promise<FarmerCase | null> {
  const cases = await readAll();
  return cases.find((entry) => entry.id === id.toUpperCase().trim()) ?? null;
}
