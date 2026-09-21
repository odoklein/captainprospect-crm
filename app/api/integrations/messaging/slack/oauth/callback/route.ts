import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.redirect(new URL('/manager/settings/integrations/messaging?error=missing_params', req.url));
    }

    try {
      const { handleSlackOAuthCallback } = await import('@/lib/integrations/messaging/adapters/slack/oauth');
      await handleSlackOAuthCallback(code, state);
      return NextResponse.redirect(new URL('/manager/settings/integrations/messaging?installed=true', req.url));
    } catch (err: any) {
      console.error('[slack:oauth] Callback failed:', err);
      return NextResponse.redirect(new URL(`/manager/settings/integrations/messaging?error=${encodeURIComponent(err.message)}`, req.url));
    }
  } catch (error) {
    console.error('[slack:oauth] Error:', error);
    return NextResponse.redirect(new URL('/manager/settings/integrations/messaging?error=internal_error', req.url));
  }
}
