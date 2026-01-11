import { fetchWalletScore } from '@/lib/basescan';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Validate address format
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
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

    return NextResponse.json({
      success: true,
      data: {
        address: walletData.address,
        builderScore: walletData.builderScore,
        degenScore: walletData.degenScore,
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
