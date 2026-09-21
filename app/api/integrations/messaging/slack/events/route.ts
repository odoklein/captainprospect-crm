import { NextResponse } from 'next/server';
import { after } from 'next/server';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Verify signature (mocked/stubbed until real implementation)
    let verifySlackSignature: any;
    try {
      const mod = await import('@/lib/integrations/messaging/adapters/slack/verify');
      verifySlackSignature = mod.verifySlackSignature;
    } catch {}

    if (verifySlackSignature) {
      const isValid = await verifySlackSignature(req, rawBody);
      if (!isValid) return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check idempotency (mocked for now, assumes Prisma)
    const externalEventId = body.event_id;
    if (externalEventId) {
      const { prisma } = await import('@/lib/prisma');
      try {
        await prisma.messagingInboundEvent.create({
          data: {
            externalEventId,
            kind: 'message',
            workspaceExternalId: body.team_id || '',
            channelId: body.event?.channel || '',
            userId: body.event?.user || '',
            payload: body,
          },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          // duplicate, already handled
          return new NextResponse('OK', { status: 200 });
        }
      }
    }

    // Process event asynchronously
    after(async () => {
      console.log('[slack:events] Processing event asynchronously:', body.type);
    });

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[slack:events] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
