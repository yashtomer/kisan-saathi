import { NextRequest, NextResponse } from 'next/server';
import { listCases, setCaseStatus, type CaseStatus } from '@/lib/cases/store';

/** Feeds the expert dashboard. Polled while a case is in progress. */

export const dynamic = 'force-dynamic';

export async function GET() {
  const cases = await listCases();
  return NextResponse.json(
    { cases },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const ALLOWED: CaseStatus[] = ['open', 'escalated', 'resolved'];

export async function PATCH(request: NextRequest) {
  let body: { id?: string; status?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, status } = body;

  if (!id || !status || !ALLOWED.includes(status as CaseStatus)) {
    return NextResponse.json(
      { error: `id and status (${ALLOWED.join(' | ')}) are required` },
      { status: 400 },
    );
  }

  const updated = await setCaseStatus(id, status as CaseStatus);
  if (!updated) {
    return NextResponse.json({ error: `No case ${id}` }, { status: 404 });
  }

  return NextResponse.json({ case: updated });
}
