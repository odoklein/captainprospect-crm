import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    
    // Verify signature
    let verifySlackSignature: any;
    try {
      const mod = await import('@/lib/integrations/messaging/adapters/slack/verify');
      verifySlackSignature = mod.verifySlackSignature;
    } catch {}

    if (verifySlackSignature) {
      const isValid = await verifySlackSignature(req, rawBody);
      if (!isValid) return new NextResponse('Unauthorized', { status: 401 });
    }

    console.log('[slack:interactivity] Received interactive payload');
    
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[slack:interactivity] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
