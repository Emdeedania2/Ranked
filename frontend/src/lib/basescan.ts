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
}

export async function fetchWalletScore(address: string): Promise<WalletScore> {
  const normalizedAddress = address.toLowerCase();

  let builderScore = 0;
  let degenScore = 0;
  let contractsDeployed = 0;
  let tokenTransfers = 0;
  let totalTransactions = 0;
  let ethBalance = '0';

  try {
    // Get address info from Blockscout
    const addressResponse = await fetch(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}`);

    if (addressResponse.ok) {
      const addressData = await addressResponse.json();

      // Get ETH balance
      if (addressData.coin_balance) {
        const balanceWei = BigInt(addressData.coin_balance);
        ethBalance = (Number(balanceWei) / 1e18).toFixed(4);
      }

      // Check if this address is a contract creator
      if (addressData.creator_address_hash) {
        // This address was created, so it's a contract - check who created it
      }
    }

    // Get counters for accurate transaction count
    const countersResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/counters`
    );

    if (countersResponse.ok) {
      const counters = await countersResponse.json();
      totalTransactions = parseInt(counters.transactions_count) || 0;
      tokenTransfers = parseInt(counters.token_transfers_count) || 0;
    }

    // Fetch transactions to analyze activity
    const txResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/transactions`
    );

    if (txResponse.ok) {
      const txData = await txResponse.json();
      const transactions = txData.items || [];

      for (const tx of transactions) {
        const fromAddress = tx.from?.hash?.toLowerCase() || '';
        const isOutgoing = fromAddress === normalizedAddress;

        // Contract deployment
        if (tx.created_contract && isOutgoing) {
          builderScore += 10; // High points for deploying contracts
          contractsDeployed++;
          continue;
        }

        // Analyze outgoing transactions
        if (isOutgoing) {
          const txTypes = tx.transaction_types || [];

          // Contract interactions
          if (txTypes.includes('contract_call')) {
            degenScore += 1;
          }

          // Token minting
          if (tx.method === 'mint' || tx.method === 'claim') {
            degenScore += 2;
          }
        }
      }
    }

    // Fetch token transfers for degen scoring
    const tokenResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/token-transfers`
    );

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      const transfers = tokenData.items || [];

      for (const transfer of transfers) {
        const fromAddress = transfer.from?.hash?.toLowerCase() || '';
        const toAddress = transfer.to?.hash?.toLowerCase() || '';

        // Outgoing transfers = active trading
        if (fromAddress === normalizedAddress) {
          degenScore += 2;
        }

        // Incoming NFT/token = collecting
        if (toAddress === normalizedAddress) {
          degenScore += 1;
        }
      }
    }

    // Bonus points based on total activity
    if (totalTransactions > 1000) builderScore += 5;
    if (totalTransactions > 100) builderScore += 2;
    if (tokenTransfers > 100) degenScore += 5;
    if (tokenTransfers > 50) degenScore += 2;

  } catch (error) {
    console.error('Error fetching wallet data:', error);
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
  };
}
