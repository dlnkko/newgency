import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // TODO: verify Whop webhook signature and process events
    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
