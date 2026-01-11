import { NextRequest, NextResponse } from 'next/server';
import { fetchWalletScore } from '@/lib/basescan';

export const dynamic = 'force-dynamic';

const BLOCKSCOUT_API = 'https://base.blockscout.com/api/v2';

// Cache for leaderboard data (refreshes periodically)
interface CachedScore {
  address: string;
  builderScore: number;
  degenScore: number;
  totalTransactions: number;
  timestamp: number;
}

let leaderboardCache: CachedScore[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch active wallets from recent blocks
async function fetchActiveWallets(): Promise<CachedScore[]> {
  const wallets: CachedScore[] = [];
  const seenAddresses = new Set<string>();

  try {
    // Fetch recent blocks
    const blocksResponse = await fetch(`${BLOCKSCOUT_API}/blocks?limit=5`);

    if (!blocksResponse.ok) {
      throw new Error('Failed to fetch blocks');
    }

    const blocksData = await blocksResponse.json();
    const blocks = blocksData.items || [];

    for (const block of blocks) {
      // Fetch transactions from each block
      const blockTxResponse = await fetch(
        `${BLOCKSCOUT_API}/blocks/${block.height}/transactions?limit=30`
      );

      if (blockTxResponse.ok) {
        const blockTxData = await blockTxResponse.json();
        const transactions = blockTxData.items || [];

        for (const tx of transactions) {
          const fromAddress = tx.from?.hash?.toLowerCase();

          // Skip if we've already processed this address or if it's a contract
          if (!fromAddress || seenAddresses.has(fromAddress)) continue;
          if (tx.from?.is_contract) continue;

          seenAddresses.add(fromAddress);

          // Only process a limited number to keep response time reasonable
          if (wallets.length >= 20) break;

          try {
            const score = await fetchWalletScore(fromAddress);
            if (score.totalTransactions > 5) { // Only include active wallets
              wallets.push({
                address: score.address,
                builderScore: score.builderScore,
                degenScore: score.degenScore,
                totalTransactions: score.totalTransactions,
                timestamp: Date.now(),
              });
            }
          } catch {
            // Skip wallets that fail to fetch
          }
        }
      }

      if (wallets.length >= 20) break;
    }
  } catch (error) {
    console.error('Error fetching active wallets:', error);
  }

  return wallets;
}

// Manual additions from user searches (in-memory)
const userSearchedWallets: Map<string, CachedScore> = new Map();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // Check if cache needs refresh
    const now = Date.now();
    if (now - lastFetchTime > CACHE_DURATION || leaderboardCache.length === 0) {
      console.log('Refreshing leaderboard cache...');
      leaderboardCache = await fetchActiveWallets();
      lastFetchTime = now;
    }

    // Combine cached data with user searched wallets
    const allScores = [
      ...leaderboardCache,
      ...Array.from(userSearchedWallets.values()),
    ];

    // Remove duplicates, keeping the most recent
    const uniqueScores = new Map<string, CachedScore>();
    for (const score of allScores) {
      const existing = uniqueScores.get(score.address);
      if (!existing || score.timestamp > existing.timestamp) {
        uniqueScores.set(score.address, score);
      }
    }

    const scores = Array.from(uniqueScores.values());

    // Sort based on type
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
      data: sortedScores.slice(0, limit).map((s, index) => ({
        address: s.address,
        builderScore: s.builderScore,
        degenScore: s.degenScore,
        totalTransactions: s.totalTransactions,
        rank: index + 1,
      })),
      meta: {
        count: Math.min(sortedScores.length, limit),
        totalCount: uniqueScores.size,
        type,
        lastUpdated: new Date(lastFetchTime).toISOString(),
        message: 'Leaderboard shows active Base wallets. Search your wallet to appear!',
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
    const { address, builderScore, degenScore, totalTransactions } = body;

    if (!address || typeof builderScore !== 'number' || typeof degenScore !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid data' },
        { status: 400 }
      );
    }

    userSearchedWallets.set(address.toLowerCase(), {
      address: address.toLowerCase(),
      builderScore,
      degenScore,
      totalTransactions: totalTransactions || 0,
      timestamp: Date.now(),
    });

    // Keep only last 500 user entries
    if (userSearchedWallets.size > 500) {
      const oldest = Array.from(userSearchedWallets.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      userSearchedWallets.delete(oldest[0]);
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
