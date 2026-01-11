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
  _request: NextRequest,
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

    // Fetch live data from Blockscout
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
    if (walletData.totalVolumeUSD >= 100000) badges.push('Whale');
    if (walletData.totalVolumeUSD >= 10000) badges.push('High Roller');
    if (walletData.topDappInteractions >= 20) badges.push('dApp Power User');

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
          totalVolumeUSD: walletData.totalVolumeUSD,
          topDapp: walletData.topDapp,
          topDappInteractions: walletData.topDappInteractions,
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
