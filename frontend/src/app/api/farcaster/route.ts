import { NextResponse } from 'next/server';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://based-or-degen.vercel.app';

  return NextResponse.json({
    accountAssociation: {
      header: process.env.FARCASTER_HEADER || '',
      payload: process.env.FARCASTER_PAYLOAD || '',
      signature: process.env.FARCASTER_SIGNATURE || '',
    },
    frame: {
      version: '1',
      name: 'Based or Degen?',
      iconUrl: `${appUrl}/icon-512.png`,
      homeUrl: appUrl,
      imageUrl: `${appUrl}/og-image.png`,
      buttonTitle: 'Check Your Score',
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: '#000000',
      webhookUrl: `${appUrl}/api/webhook`,
    },
  });
}
