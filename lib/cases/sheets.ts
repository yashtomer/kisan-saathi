import type { FarmerCase } from './store';

/**
 * Pushes a case into a shared Google Sheet — the cooperative's register.
 *
 * Uses a Google Apps Script web app rather than the Sheets API: no service
 * account, no OAuth, no key management. Deploy the script bound to the sheet,
 * set SHEETS_WEBHOOK_URL, and it appends a row.
 *
 * Never throws. A failed sync must not cost the farmer his case — the record
 * already exists locally by the time this runs.
 */

const TIMEOUT_MS = 4000;

export type SheetSyncResult = { synced: boolean; reason?: string };

export async function pushCaseToSheet(
  record: FarmerCase,
): Promise<SheetSyncResult> {
  const endpoint = process.env.SHEETS_WEBHOOK_URL;
  if (!endpoint) return { synced: false, reason: 'SHEETS_WEBHOOK_URL not set' };

  // Column order is fixed here so the sheet's headers stay meaningful.
  const row = {
    caseId: record.id,
    createdAt: record.createdAt,
    status: record.status,
    farmerName: record.farmerName ?? '',
    village: record.village ?? '',
    crop: record.crop,
    symptoms: record.symptoms,
    durationDays: record.durationDays ?? '',
    affectedArea: record.affectedArea ?? '',
    spreading: record.spreading ?? '',
    recentTreatment: record.recentTreatment ?? '',
    suspectedCause: record.suspectedCause ?? '',
    confidence: record.confidence ?? '',
    urgency: record.urgency ?? '',
    weatherContext: record.weatherContext ?? '',
    language: record.language ?? '',
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Apps Script answers with a redirect to its script.googleusercontent
      // host; following it is what actually completes the write.
      redirect: 'follow',
    });

    if (!response.ok) {
      return { synced: false, reason: `sheet responded ${response.status}` };
    }

    console.log(`[sheets] case ${record.id} appended`);
    return { synced: true };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'sheet request failed';
    console.error(`[sheets] case ${record.id} not synced: ${reason}`);
    return { synced: false, reason };
  }
}
