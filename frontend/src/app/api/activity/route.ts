import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Return empty activity for now - activity will be populated as users check their scores
    return NextResponse.json({
      success: true,
      data: [],
      message: 'Connect your wallet to see live activity!',
    });
  } catch (error) {
    console.error('Activity API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
