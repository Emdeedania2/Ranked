// Base blockchain API integration using Blockscout
// Fetches wallet transaction data to calculate Builder/Degen scores

const BLOCKSCOUT_API = 'https://base.blockscout.com/api/v2';

export interface WalletScore {
  address: string;
  builderScore: number;
  degenScore: number;
  totalTransactions: number;
  contractsDeployed: number;
  tokenTransfers: number;
  classification: 'Builder' | 'Degen' | 'Balanced' | 'New';
  ethBalance: string;
  totalVolumeUSD: number;
  topDapp: string;
  topDappInteractions: number;
}

export interface AnalysisProgress {
  stage: string;
  progress: number;
}

// Known dApp contract addresses on Base
const KNOWN_DAPPS: Record<string, string> = {
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap',
  '0x2626664c2603336e57b271c5c0b26f421741e481': 'Uniswap V3',
  '0x198ef79f1f515f02dfe9e3115ed9fc07183f02fc': 'Aerodrome',
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': 'Aerodrome Router',
  '0x6cb442acf35158d5eda88fe602571dbe4e0c5cd5': 'BaseSwap',
  '0x327df1e6de05895d2ab08513aadd9313fe505d86': 'SushiSwap',
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae': 'LI.FI',
  '0x0000000000001ff3684f28c67538d4d072c22734': 'Across Bridge',
  '0x49048044d57e1c92a77f79988d21fa8faf74e97e': 'Base Bridge',
  '0x8453fc6cd17a1654029e0d40610527ef9ed56e7a': 'Friend.tech',
  '0xc5a076cad94176c2996b32d8466be1ce757faa27': 'Mint.fun',
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'Seaport (OpenSea)',
  '0x0000000000a39bb272e79075ade125fd351887ac': 'Blur',
  '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401': 'PoolTogether',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x532f27101965dd16442e59d40670faf5ebb142e4': 'Brett Token',
  '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4': 'Toshi Token',
};

type ProgressCallback = (progress: AnalysisProgress) => void;

export async function fetchWalletScore(
  address: string,
  onProgress?: ProgressCallback
): Promise<WalletScore> {
  const normalizedAddress = address.toLowerCase();

  let builderScore = 0;
  let degenScore = 0;
  let contractsDeployed = 0;
  let tokenTransfers = 0;
  let totalTransactions = 0;
  let ethBalance = '0';
  let totalVolumeUSD = 0;
  const dappInteractions: Record<string, number> = {};

  try {
    // Stage 1: Get address info (10%)
    onProgress?.({ stage: 'Fetching wallet info...', progress: 10 });

    const addressResponse = await fetch(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}`);

    if (addressResponse.ok) {
      const addressData = await addressResponse.json();

      if (addressData.coin_balance) {
        const balanceWei = BigInt(addressData.coin_balance);
        ethBalance = (Number(balanceWei) / 1e18).toFixed(4);
      }
    }

    // Stage 2: Get counters (25%)
    onProgress?.({ stage: 'Analyzing transaction counts...', progress: 25 });

    const countersResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/counters`
    );

    if (countersResponse.ok) {
      const counters = await countersResponse.json();
      totalTransactions = parseInt(counters.transactions_count) || 0;
      tokenTransfers = parseInt(counters.token_transfers_count) || 0;
    }

    // Stage 3: Fetch transactions to analyze activity (40%)
    onProgress?.({ stage: 'Analyzing transactions...', progress: 40 });

    const txResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/transactions?limit=50`
    );

    if (txResponse.ok) {
      const txData = await txResponse.json();
      const transactions = txData.items || [];

      for (const tx of transactions) {
        const fromAddress = tx.from?.hash?.toLowerCase() || '';
        const toAddress = tx.to?.hash?.toLowerCase() || '';
        const isOutgoing = fromAddress === normalizedAddress;

        // Track dApp interactions
        if (toAddress && KNOWN_DAPPS[toAddress]) {
          dappInteractions[KNOWN_DAPPS[toAddress]] = (dappInteractions[KNOWN_DAPPS[toAddress]] || 0) + 1;
        }

        // Calculate volume from transaction value (ETH transfers)
        if (tx.value && tx.value !== '0') {
          try {
            const valueWei = BigInt(tx.value);
            const valueEth = Number(valueWei) / 1e18;
            // Use current approximate ETH price (~$3500 in 2025)
            if (valueEth > 0.0001) { // Filter dust
              totalVolumeUSD += valueEth * 3500;
            }
          } catch {
            // Skip invalid values
          }
        }

        // Also check tx.fee for gas costs
        if (tx.fee?.value) {
          try {
            const feeWei = BigInt(tx.fee.value);
            const feeEth = Number(feeWei) / 1e18;
            totalVolumeUSD += feeEth * 3500;
          } catch {
            // Skip invalid values
          }
        }

        // Contract deployment
        if (tx.created_contract && isOutgoing) {
          builderScore += 10;
          contractsDeployed++;
          continue;
        }

        // Analyze outgoing transactions
        if (isOutgoing) {
          const txTypes = tx.transaction_types || [];

          if (txTypes.includes('contract_call')) {
            degenScore += 1;
          }

          if (tx.method === 'mint' || tx.method === 'claim') {
            degenScore += 2;
          }

          // Swap/trade detection
          if (tx.method === 'swap' || tx.method === 'swapExactTokensForTokens' ||
              tx.method === 'swapExactETHForTokens' || tx.method === 'execute') {
            degenScore += 3;
          }
        }
      }
    }

    // Stage 4: Fetch token transfers (60%)
    onProgress?.({ stage: 'Analyzing token transfers...', progress: 60 });

    const tokenResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/token-transfers?limit=50`
    );

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      const transfers = tokenData.items || [];

      for (const transfer of transfers) {
        const fromAddress = transfer.from?.hash?.toLowerCase() || '';
        const toAddress = transfer.to?.hash?.toLowerCase() || '';

        // Add to volume estimate from token transfers
        const tokenSymbol = transfer.token?.symbol?.toUpperCase() || '';
        const tokenDecimals = parseInt(transfer.token?.decimals) || 18;

        // Try to get the value from different possible fields
        let rawValue = transfer.total?.value || transfer.value || '0';

        try {
          if (rawValue && rawValue !== '0') {
            const value = Number(rawValue) / Math.pow(10, tokenDecimals);

            // Stablecoins - direct USD value
            if (['USDC', 'USDT', 'DAI', 'USDB', 'USDbC'].includes(tokenSymbol)) {
              totalVolumeUSD += value;
            }
            // WETH - use ETH price
            else if (['WETH', 'ETH'].includes(tokenSymbol)) {
              totalVolumeUSD += value * 3500;
            }
            // Other tokens - estimate based on a rough average value
            else if (value > 0) {
              // Assume average token price of $0.10 for unknown tokens
              totalVolumeUSD += value * 0.1;
            }
          }
        } catch {
          // Skip invalid values
        }

        if (fromAddress === normalizedAddress) {
          degenScore += 2;
        }

        if (toAddress === normalizedAddress) {
          degenScore += 1;
        }
      }
    }

    // Stage 5: Analyze internal transactions for more dApp data (80%)
    onProgress?.({ stage: 'Analyzing dApp interactions...', progress: 80 });

    const internalTxResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/internal-transactions?limit=50`
    );

    if (internalTxResponse.ok) {
      const internalData = await internalTxResponse.json();
      const internalTxs = internalData.items || [];

      for (const tx of internalTxs) {
        const toAddress = tx.to?.hash?.toLowerCase() || '';
        if (toAddress && KNOWN_DAPPS[toAddress]) {
          dappInteractions[KNOWN_DAPPS[toAddress]] = (dappInteractions[KNOWN_DAPPS[toAddress]] || 0) + 1;
        }
      }
    }

    // Stage 6: Final calculations (90%)
    onProgress?.({ stage: 'Calculating scores...', progress: 90 });

    // Bonus points based on total activity
    if (totalTransactions > 1000) builderScore += 5;
    if (totalTransactions > 100) builderScore += 2;
    if (tokenTransfers > 100) degenScore += 5;
    if (tokenTransfers > 50) degenScore += 2;

    // Stage 7: Complete (100%)
    onProgress?.({ stage: 'Analysis complete!', progress: 100 });

  } catch (error) {
    console.error('Error fetching wallet data:', error);
    onProgress?.({ stage: 'Error fetching data', progress: 100 });
  }

  // Find top dApp
  let topDapp = 'None';
  let topDappInteractions = 0;
  for (const [dapp, count] of Object.entries(dappInteractions)) {
    if (count > topDappInteractions) {
      topDapp = dapp;
      topDappInteractions = count;
    }
  }

  // Determine classification
  let classification: WalletScore['classification'] = 'New';

  if (totalTransactions === 0) {
    classification = 'New';
  } else if (builderScore === 0 && degenScore === 0) {
    classification = 'Balanced';
  } else if (builderScore >= degenScore * 1.5 && contractsDeployed > 0) {
    classification = 'Builder';
  } else if (degenScore >= builderScore * 1.5) {
    classification = 'Degen';
  } else {
    classification = 'Balanced';
  }

  return {
    address: normalizedAddress,
    builderScore,
    degenScore,
    totalTransactions,
    contractsDeployed,
    tokenTransfers,
    classification,
    ethBalance,
    totalVolumeUSD: Math.round(totalVolumeUSD),
    topDapp,
    topDappInteractions,
  };
}

// Fetch top wallets from recent blocks for leaderboard
export async function fetchTopWallets(limit: number = 20): Promise<WalletScore[]> {
  const wallets: WalletScore[] = [];
  const seenAddresses = new Set<string>();

  try {
    // Fetch recent blocks to find active wallets
    const blocksResponse = await fetch(`${BLOCKSCOUT_API}/blocks?limit=10`);

    if (blocksResponse.ok) {
      const blocksData = await blocksResponse.json();
      const blocks = blocksData.items || [];

      for (const block of blocks) {
        // Fetch transactions from each block
        const blockTxResponse = await fetch(
          `${BLOCKSCOUT_API}/blocks/${block.height}/transactions?limit=20`
        );

        if (blockTxResponse.ok) {
          const blockTxData = await blockTxResponse.json();
          const transactions = blockTxData.items || [];

          for (const tx of transactions) {
            const fromAddress = tx.from?.hash?.toLowerCase();

            if (fromAddress && !seenAddresses.has(fromAddress) && seenAddresses.size < limit * 2) {
              seenAddresses.add(fromAddress);

              // Fetch score for this wallet (without progress callback for background fetch)
              try {
                const score = await fetchWalletScore(fromAddress);
                if (score.totalTransactions > 0) {
                  wallets.push(score);
                }
              } catch {
                // Skip wallets that fail to fetch
              }

              if (wallets.length >= limit) break;
            }
          }
        }

        if (wallets.length >= limit) break;
      }
    }
  } catch (error) {
    console.error('Error fetching top wallets:', error);
  }

  return wallets.slice(0, limit);
}
