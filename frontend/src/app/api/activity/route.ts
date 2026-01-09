import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get the most recently updated wallets (simulating live activity)
    const recentActivity = await prisma.walletScore.findMany({
      take: 10,
      orderBy: { lastUpdated: 'desc' },
      select: {
        address: true,
        builderScore: true,
        degenScore: true,
        lastUpdated: true,
      },
    });

    // Transform into activity feed format
    const activities = recentActivity.map((wallet) => {
      const isBuilder = wallet.builderScore > wallet.degenScore;
      return {
        address: wallet.address,
        type: isBuilder ? 'builder' : 'degen',
        score: isBuilder ? wallet.builderScore : wallet.degenScore,
        timestamp: wallet.lastUpdated,
      };
    });

    return NextResponse.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error('Activity API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
