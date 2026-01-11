import { fetchWalletScore } from '@/lib/basescan';
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, isAddress } from 'viem';
import { mainnet, base } from 'viem/chains';
import { normalize } from 'viem/ens';

export const dynamic = 'force-dynamic';

// ENS/Basename resolution clients
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const baseClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Resolve ENS or Basename to address
async function resolveNameToAddress(name: string): Promise<string | null> {
  try {
    // Try ENS first (mainnet) for .eth names
    if (name.endsWith('.eth') && !name.endsWith('.base.eth')) {
      const address = await mainnetClient.getEnsAddress({
        name: normalize(name),
      });
      return address;
    }

    // Try Basename for .base.eth names
    if (name.endsWith('.base.eth')) {
      const address = await baseClient.getEnsAddress({
        name: normalize(name),
      });
      return address;
    }

    // Try both if no specific suffix
    const ensAddress = await mainnetClient.getEnsAddress({
      name: normalize(name),
    }).catch(() => null);

    if (ensAddress) return ensAddress;

    const baseAddress = await baseClient.getEnsAddress({
      name: normalize(name),
    }).catch(() => null);

    return baseAddress;
  } catch (error) {
    console.log('Name resolution failed:', error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address: inputAddress } = await params;
    let address = inputAddress;

    // Check if input is a name (ENS or Basename) rather than an address
    if (!isAddress(inputAddress)) {
      const resolvedAddress = await resolveNameToAddress(inputAddress);
      if (!resolvedAddress) {
        return NextResponse.json(
          { success: false, error: 'Could not resolve name to address' },
          { status: 400 }
        );
      }
      address = resolvedAddress;
    }

    // Validate address format
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    // Fetch live data from Basescan
    const walletData = await fetchWalletScore(address);

    // Calculate personality percentage
    const totalScore = walletData.builderScore + walletData.degenScore;
    const builderPercentage = totalScore > 0
      ? Math.round((walletData.builderScore / totalScore) * 100)
      : 50;
    const degenPercentage = 100 - builderPercentage;

    // Determine personality type
    let personality: string;
    if (walletData.classification === 'New') {
      personality = 'New to Base';
    } else if (builderPercentage >= 80) {
      personality = 'Ultimate Builder';
    } else if (builderPercentage >= 60) {
      personality = 'Builder-Leaning';
    } else if (degenPercentage >= 80) {
      personality = 'Full Degen';
    } else if (degenPercentage >= 60) {
      personality = 'Degen-Curious';
    } else {
      personality = 'Perfectly Balanced';
    }

    // Determine badges
    const badges: string[] = [];
    if (walletData.contractsDeployed >= 10) badges.push('Master Builder');
    if (walletData.contractsDeployed >= 5) badges.push('Contract Creator');
    if (walletData.tokenTransfers >= 100) badges.push('Mega Degen');
    if (walletData.tokenTransfers >= 50) badges.push('Active Trader');
    if (walletData.totalTransactions >= 1000) badges.push('Power User');
    if (walletData.totalTransactions >= 500) badges.push('Veteran');
    if (Math.abs(builderPercentage - 50) <= 10) badges.push('Balanced');
    if (walletData.classification === 'Builder') badges.push('Builder');
    if (walletData.classification === 'Degen') badges.push('Degen');

    // Fetch leaderboard to calculate ranks
    let builderRank = 0;
    let degenRank = 0;
    let totalWallets = 1;

    try {
      // Fetch from internal leaderboard API
      const [builderRes, degenRes] = await Promise.all([
        fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/leaderboard?type=builder&limit=1000`),
        fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/leaderboard?type=degen&limit=1000`),
      ]);

      const [builderData, degenData] = await Promise.all([
        builderRes.json(),
        degenRes.json(),
      ]);

      if (builderData.success) {
        totalWallets = Math.max(totalWallets, builderData.meta?.totalCount || builderData.data.length);
        // Find rank based on builder score
        const sortedBuilders = builderData.data.sort((a: { builderScore: number }, b: { builderScore: number }) => b.builderScore - a.builderScore);
        const builderIndex = sortedBuilders.findIndex((w: { address: string }) => w.address.toLowerCase() === walletData.address);
        if (builderIndex >= 0) {
          builderRank = builderIndex + 1;
        } else {
          // Calculate estimated rank based on score
          const higherScores = sortedBuilders.filter((w: { builderScore: number }) => w.builderScore > walletData.builderScore).length;
          builderRank = higherScores + 1;
        }
      }

      if (degenData.success) {
        totalWallets = Math.max(totalWallets, degenData.meta?.totalCount || degenData.data.length);
        // Find rank based on degen score
        const sortedDegens = degenData.data.sort((a: { degenScore: number }, b: { degenScore: number }) => b.degenScore - a.degenScore);
        const degenIndex = sortedDegens.findIndex((w: { address: string }) => w.address.toLowerCase() === walletData.address);
        if (degenIndex >= 0) {
          degenRank = degenIndex + 1;
        } else {
          // Calculate estimated rank based on score
          const higherScores = sortedDegens.filter((w: { degenScore: number }) => w.degenScore > walletData.degenScore).length;
          degenRank = higherScores + 1;
        }
      }
    } catch (e) {
      // If leaderboard fetch fails, show as new entry
      console.log('Could not fetch leaderboard for ranking:', e);
      builderRank = 1;
      degenRank = 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        address: walletData.address,
        builderScore: walletData.builderScore,
        degenScore: walletData.degenScore,
        builderRank,
        degenRank,
        totalWallets,
        builderPercentage,
        degenPercentage,
        personality,
        classification: walletData.classification,
        badges,
        stats: {
          totalTransactions: walletData.totalTransactions,
          contractsDeployed: walletData.contractsDeployed,
          tokenTransfers: walletData.tokenTransfers,
        },
      },
    });
  } catch (error) {
    console.error('Wallet API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet data' },
      { status: 500 }
    );
  }
}
