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

    console.log('[slack:commands] Received command payload');
    
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Coming soon',
    });
  } catch (error) {
    console.error('[slack:commands] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
