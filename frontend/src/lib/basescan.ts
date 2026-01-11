// Base blockchain API integration using Blockscout
// Fetches wallet transaction data to calculate Builder/Degen scores

const BASE_RPC_URL = 'https://mainnet.base.org';
const BLOCKSCOUT_API = 'https://base.blockscout.com/api/v2';

// Known DEX Router addresses on Base (excluded from degen scoring)
const DEX_ROUTERS = new Set([
  '0x2626664c2603336e57b271c5c0b26f421741e481',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43',
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5',
]);

// DEX swap method signatures
const DEX_SIGNATURES = new Set([
  '0x38ed1739', '0x8803dbee', '0x7ff36ab5', '0x4a25d94a',
  '0x18cbafe5', '0xfb3bdb41', '0x5ae401dc', '0xac9650d8',
  '0x04e45aaf', '0xb858183f', '0x5023b4df', '0x09b81346',
]);

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

async function rpcCall(method: string, params: unknown[]) {
  const response = await fetch(BASE_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  const data = await response.json();
  return data.result;
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
    }

    // Get transaction count from RPC
    const nonceHex = await rpcCall('eth_getTransactionCount', [normalizedAddress, 'latest']);
    if (nonceHex) {
      totalTransactions = parseInt(nonceHex, 16);
    }

    // Fetch transactions from Blockscout
    const txResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/transactions`
    );

    if (txResponse.ok) {
      const txData = await txResponse.json();
      const transactions = txData.items || [];

      for (const tx of transactions) {
        const fromAddress = tx.from?.hash?.toLowerCase() || '';
        const isOutgoing = fromAddress === normalizedAddress;

        // Contract deployment (created_contract is set)
        if (tx.created_contract && isOutgoing) {
          builderScore += 5;
          contractsDeployed++;
          continue;
        }

        // Check transaction types
        const txTypes = tx.transaction_types || [];

        if (isOutgoing) {
          const toAddress = tx.to?.hash?.toLowerCase() || '';
          const methodSig = tx.raw_input?.slice(0, 10)?.toLowerCase() || '';

          // Skip DEX interactions
          if (DEX_ROUTERS.has(toAddress) || DEX_SIGNATURES.has(methodSig)) {
            continue;
          }

          // Contract interactions (potential degen activity)
          if (txTypes.includes('contract_call') && !txTypes.includes('coin_transfer')) {
            degenScore += 1;
          }
        }
      }
    }

    // Fetch token transfers for more accurate degen scoring
    const tokenResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/token-transfers`
    );

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      const transfers = tokenData.items || [];

      tokenTransfers = transfers.length;

      // Count outgoing token transfers as degen activity
      for (const transfer of transfers) {
        const fromAddress = transfer.from?.hash?.toLowerCase() || '';
        if (fromAddress === normalizedAddress) {
          degenScore += 1;
        }
      }
    }

    // Check for deployed contracts
    const countersResponse = await fetch(
      `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/counters`
    );

    if (countersResponse.ok) {
      const counters = await countersResponse.json();

      // If they have deployed contracts, add to builder score
      if (counters.transactions_count) {
        totalTransactions = parseInt(counters.transactions_count) || totalTransactions;
      }
    }

  } catch (error) {
    console.error('Error fetching wallet data:', error);
  }

  // Determine classification
  let classification: WalletScore['classification'] = 'New';

  const totalActivity = builderScore + degenScore;

  if (totalTransactions === 0) {
    classification = 'New';
  } else if (totalActivity === 0) {
    classification = 'Balanced';
  } else if (builderScore >= 5 && builderScore > degenScore) {
    classification = 'Builder';
  } else if (degenScore >= 5 && degenScore > builderScore) {
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
