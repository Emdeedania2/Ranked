import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all'; // 'builder', 'degen', or 'all'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const timeFilter = searchParams.get('time') || 'all'; // 'day', 'week', or 'all'

    let orderBy: { builderScore?: 'desc'; degenScore?: 'desc' } = {};

    if (type === 'builder') {
      orderBy = { builderScore: 'desc' };
    } else if (type === 'degen') {
      orderBy = { degenScore: 'desc' };
    } else {
      // For 'all', we'll fetch both and let the frontend handle it
      orderBy = { builderScore: 'desc' };
    }

    // Calculate time filter date
    let dateFilter: Date | undefined;
    const now = new Date();
    if (timeFilter === 'day') {
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (timeFilter === 'week') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const whereClause = dateFilter ? { lastUpdated: { gte: dateFilter } } : undefined;

    // Get total count for pagination
    const totalCount = await prisma.walletScore.count({
      where: whereClause,
    });

    const scores = await prisma.walletScore.findMany({
      take: limit,
      skip: offset,
      orderBy,
      where: whereClause,
      select: {
        address: true,
        builderScore: true,
        degenScore: true,
        lastUpdated: true,
      },
    });

    // Get indexer state for status
    const indexerState = await prisma.indexerState.findUnique({
      where: { id: 'main' },
    });

    return NextResponse.json({
      success: true,
      data: scores,
      meta: {
        count: scores.length,
        totalCount,
        type,
        timeFilter,
        offset,
        limit,
        lastBlockProcessed: indexerState?.lastBlockNumber?.toString() || '0',
        lastUpdated: indexerState?.updatedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch leaderboard data',
      },
      { status: 500 }
    );
  }
}
