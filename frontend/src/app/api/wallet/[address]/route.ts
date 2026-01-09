import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const normalizedAddress = address.toLowerCase();

    const wallet = await prisma.walletScore.findUnique({
      where: { address: normalizedAddress },
    });

    if (!wallet) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Wallet not found in database',
      });
    }

    // Calculate rank for builder and degen
    const builderRank = await prisma.walletScore.count({
      where: { builderScore: { gt: wallet.builderScore } },
    });

    const degenRank = await prisma.walletScore.count({
      where: { degenScore: { gt: wallet.degenScore } },
    });

    const totalWallets = await prisma.walletScore.count();

    // Calculate personality percentage
    const totalScore = wallet.builderScore + wallet.degenScore;
    const builderPercentage = totalScore > 0 ? Math.round((wallet.builderScore / totalScore) * 100) : 50;
    const degenPercentage = 100 - builderPercentage;

    // Determine personality type
    let personality: string;
    if (builderPercentage >= 80) personality = 'Ultimate Builder';
    else if (builderPercentage >= 60) personality = 'Builder-Leaning';
    else if (degenPercentage >= 80) personality = 'Full Degen';
    else if (degenPercentage >= 60) personality = 'Degen-Curious';
    else personality = 'Perfectly Balanced';

    // Determine badges
    const badges: string[] = [];
    if (builderRank < 10) badges.push('Top 10 Builder');
    if (degenRank < 10) badges.push('Top 10 Degen');
    if (builderRank === 0) badges.push('Builder King');
    if (degenRank === 0) badges.push('Degen King');
    if (Math.abs(builderPercentage - 50) <= 10) badges.push('Balanced');
    if (wallet.builderScore >= 100) badges.push('Master Builder');
    if (wallet.degenScore >= 100) badges.push('Mega Degen');
    if (totalScore >= 500) badges.push('Power User');

    return NextResponse.json({
      success: true,
      data: {
        address: wallet.address,
        builderScore: wallet.builderScore,
        degenScore: wallet.degenScore,
        builderRank: builderRank + 1,
        degenRank: degenRank + 1,
        totalWallets,
        builderPercentage,
        degenPercentage,
        personality,
        badges,
        lastUpdated: wallet.lastUpdated,
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
