import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Simple in-memory cache for recent wallet scores (resets on deploy)
// For production, you could use Vercel KV or Redis
const recentScores: Map<string, {
  address: string;
  builderScore: number;
  degenScore: number;
  timestamp: number;
}> = new Map();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // Convert map to array and sort
    const scores = Array.from(recentScores.values());

    let sortedScores;
    if (type === 'builder') {
      sortedScores = scores.sort((a, b) => b.builderScore - a.builderScore);
    } else if (type === 'degen') {
      sortedScores = scores.sort((a, b) => b.degenScore - a.degenScore);
    } else {
      sortedScores = scores.sort((a, b) =>
        (b.builderScore + b.degenScore) - (a.builderScore + a.degenScore)
      );
    }

    return NextResponse.json({
      success: true,
      data: sortedScores.slice(0, limit).map(s => ({
        address: s.address,
        builderScore: s.builderScore,
        degenScore: s.degenScore,
      })),
      meta: {
        count: Math.min(sortedScores.length, limit),
        totalCount: recentScores.size,
        type,
        message: 'Leaderboard shows wallets that have checked their scores. Connect your wallet to appear!',
      },
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard data' },
      { status: 500 }
    );
  }
}

// POST endpoint to add a wallet to the leaderboard
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, builderScore, degenScore } = body;

    if (!address || typeof builderScore !== 'number' || typeof degenScore !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid data' },
        { status: 400 }
      );
    }

    recentScores.set(address.toLowerCase(), {
      address: address.toLowerCase(),
      builderScore,
      degenScore,
      timestamp: Date.now(),
    });

    // Keep only last 1000 entries
    if (recentScores.size > 1000) {
      const oldest = Array.from(recentScores.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      recentScores.delete(oldest[0]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Leaderboard POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update leaderboard' },
      { status: 500 }
    );
  }
}
