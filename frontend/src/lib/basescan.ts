// Basescan API integration for fetching wallet transaction history

const BASESCAN_API_URL = 'https://api.basescan.org/api';
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || '';

// Known DEX Router addresses on Base (excluded from degen scoring)
const DEX_ROUTERS = new Set([
  '0x2626664c2603336e57b271c5c0b26f421741e481', // Uniswap V3 Router
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43', // Aerodrome Router
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5', // Aerodrome V2 Router
]);

// DEX swap method signatures
const DEX_SIGNATURES = new Set([
  '0x38ed1739', '0x8803dbee', '0x7ff36ab5', '0x4a25d94a',
  '0x18cbafe5', '0xfb3bdb41', '0x5ae401dc', '0xac9650d8',
  '0x04e45aaf', '0xb858183f', '0x5023b4df', '0x09b81346',
]);

// In-app trade signatures (transfers, mints, etc.)
const DEGEN_SIGNATURES = new Set([
  '0xa9059cbb', // transfer (ERC20)
  '0x23b872dd', // transferFrom
  '0x42842e0e', // safeTransferFrom (ERC721)
  '0xf242432a', // safeTransferFrom (ERC1155)
  '0x40c10f19', // mint
  '0x6a627842', // mint (alt)
]);

export interface WalletScore {
  address: string;
  builderScore: number;
  degenScore: number;
  totalTransactions: number;
  contractsDeployed: number;
  tokenTransfers: number;
  classification: 'Builder' | 'Degen' | 'Balanced' | 'New';
}

interface BasescanTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  input: string;
  isError: string;
  contractAddress: string;
}

export async function fetchWalletScore(address: string): Promise<WalletScore> {
  const normalizedAddress = address.toLowerCase();

  // Fetch normal transactions
  const txResponse = await fetch(
    `${BASESCAN_API_URL}?module=account&action=txlist&address=${normalizedAddress}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`
  );
  const txData = await txResponse.json();

  let builderScore = 0;
  let degenScore = 0;
  let contractsDeployed = 0;
  let tokenTransfers = 0;

  if (txData.status === '1' && Array.isArray(txData.result)) {
    const transactions: BasescanTransaction[] = txData.result;

    for (const tx of transactions) {
      if (tx.isError === '1') continue; // Skip failed transactions

      // Contract deployment (to is empty, contractAddress is set)
      if (tx.to === '' && tx.contractAddress) {
        builderScore += 5; // Contract deployment worth more
        contractsDeployed++;
        continue;
      }

      const toAddress = tx.to.toLowerCase();
      const methodSig = tx.input?.slice(0, 10).toLowerCase() || '';

      // Skip DEX router interactions
      if (DEX_ROUTERS.has(toAddress) || DEX_SIGNATURES.has(methodSig)) {
        continue;
      }

      // Count degen activities (token transfers, mints)
      if (DEGEN_SIGNATURES.has(methodSig)) {
        degenScore += 1;
        tokenTransfers++;
      }
    }
  }

  // Fetch internal transactions (for additional contract creations)
  const internalResponse = await fetch(
    `${BASESCAN_API_URL}?module=account&action=txlistinternal&address=${normalizedAddress}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`
  );
  const internalData = await internalResponse.json();

  if (internalData.status === '1' && Array.isArray(internalData.result)) {
    for (const tx of internalData.result) {
      if (tx.type === 'create' || tx.type === 'create2') {
        builderScore += 5;
        contractsDeployed++;
      }
    }
  }

  // Determine classification
  let classification: WalletScore['classification'] = 'New';

  if (builderScore === 0 && degenScore === 0) {
    classification = 'New';
  } else if (builderScore >= 10 && builderScore > degenScore * 2) {
    classification = 'Builder';
  } else if (degenScore >= 5 && degenScore > builderScore * 2) {
    classification = 'Degen';
  } else {
    classification = 'Balanced';
  }

  return {
    address: normalizedAddress,
    builderScore,
    degenScore,
    totalTransactions: (txData.result?.length || 0),
    contractsDeployed,
    tokenTransfers,
    classification,
  };
}
