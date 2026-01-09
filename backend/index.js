import 'dotenv/config';
import { createPublicClient, http as viemHttp, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { PrismaClient } from '@prisma/client';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const prisma = new PrismaClient();

// WebSocket server for real-time updates
const server = createServer();
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('🔌 Client connected, total clients:', clients.size);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('🔌 Client disconnected, total clients:', clients.size);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    clients.delete(ws);
  });
});

function broadcastUpdate(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

const WS_PORT = process.env.WS_PORT || 3001;
server.listen(WS_PORT, () => {
  console.log(`🔌 WebSocket server running on port ${WS_PORT}`);
});

// Known DEX Router addresses on Base (excluded from in-app trades)
const DEX_ROUTERS = [
  '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3 Router
  '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Uniswap Universal Router
  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome Router
  '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5', // Aerodrome V2 Router
].map(addr => addr.toLowerCase());

// DEX swap method signatures (excluded from in-app trades)
const DEX_SIGNATURES = [
  '0x38ed1739', // swapExactTokensForTokens
  '0x8803dbee', // swapTokensForExactTokens
  '0x7ff36ab5', // swapExactETHForTokens
  '0x4a25d94a', // swapTokensForExactETH
  '0x18cbafe5', // swapExactTokensForETH
  '0xfb3bdb41', // swapETHForExactTokens
  '0x5ae401dc', // multicall (Uniswap V3)
  '0xac9650d8', // multicall
  '0x04e45aaf', // exactInputSingle
  '0xb858183f', // exactInput
  '0x5023b4df', // exactOutputSingle
  '0x09b81346', // exactOutput
];

// In-app trade method signatures (gaming, social, app interactions)
const IN_APP_TRADE_SIGNATURES = [
  '0xa9059cbb', // transfer (ERC20)
  '0x23b872dd', // transferFrom (ERC20/ERC721)
  '0x42842e0e', // safeTransferFrom (ERC721)
  '0xf242432a', // safeTransferFrom (ERC1155)
  '0x2eb2c2d6', // safeBatchTransferFrom (ERC1155)
  '0x095ea7b3', // approve
  '0xa22cb465', // setApprovalForAll
  '0x40c10f19', // mint
  '0x6a627842', // mint (alt)
];

// Scoring constants - Builder: 2+ contracts, Degen: 5+ in-app trades
const SCORES = {
  CONTRACT_DEPLOY: 1,  // Each deployment counts as 1 (need 2+ to be builder)
  IN_APP_TRADE: 1,     // Each in-app trade counts as 1 (need 5+ to be degen)
};

const client = createPublicClient({
  chain: base,
  transport: viemHttp(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

async function getLastProcessedBlock() {
  const state = await prisma.indexerState.findUnique({
    where: { id: 'main' },
  });
  return state?.lastBlockNumber ?? 0n;
}

async function updateLastProcessedBlock(blockNumber) {
  await prisma.indexerState.upsert({
    where: { id: 'main' },
    update: { lastBlockNumber: blockNumber },
    create: { id: 'main', lastBlockNumber: blockNumber },
  });
}

async function updateWalletScore(address, builderPoints, degenPoints) {
  const normalizedAddress = address.toLowerCase();

  const updatedScore = await prisma.walletScore.upsert({
    where: { address: normalizedAddress },
    update: {
      builderScore: { increment: builderPoints },
      degenScore: { increment: degenPoints },
    },
    create: {
      address: normalizedAddress,
      builderScore: builderPoints,
      degenScore: degenPoints,
    },
  });

  // Broadcast the update to connected WebSocket clients
  broadcastUpdate({
    type: 'SCORE_UPDATE',
    data: {
      address: normalizedAddress,
      builderScore: updatedScore.builderScore,
      degenScore: updatedScore.degenScore,
      timestamp: Date.now(),
    },
  });
}

function classifyTransaction(tx) {
  const result = { isBuilder: false, isDegen: false, builderPoints: 0, degenPoints: 0 };

  // Check for contract deployment (tx.to is null) - Builder activity
  if (!tx.to) {
    result.isBuilder = true;
    result.builderPoints = SCORES.CONTRACT_DEPLOY;
    console.log(`🛠️  Builder: ${tx.from} deployed a contract (+1 builder)`);
    return result;
  }

  const toAddress = tx.to.toLowerCase();
  const input = tx.input || '0x';
  const methodSig = input.slice(0, 10).toLowerCase();

  // Exclude DEX router interactions (not counted as in-app trades)
  if (DEX_ROUTERS.includes(toAddress)) {
    console.log(`⏭️  Skipping DEX swap from ${tx.from}`);
    return result;
  }

  // Exclude DEX swap method signatures
  if (DEX_SIGNATURES.includes(methodSig)) {
    console.log(`⏭️  Skipping DEX method from ${tx.from}`);
    return result;
  }

  // Check for in-app trade signatures (transfers, mints, approvals)
  if (IN_APP_TRADE_SIGNATURES.includes(methodSig)) {
    result.isDegen = true;
    result.degenPoints = SCORES.IN_APP_TRADE;
    console.log(`🎰 Degen: ${tx.from} made in-app trade (+1 degen)`);
    return result;
  }

  // Check for factory contract creation patterns - Builder activity
  const factorySignatures = ['0x60806040', '0xc9c65396', '0x1688f0b9'];
  if (factorySignatures.some(sig => input.startsWith(sig))) {
    result.isBuilder = true;
    result.builderPoints = SCORES.CONTRACT_DEPLOY;
    console.log(`🛠️  Builder: ${tx.from} used factory contract (+1 builder)`);
    return result;
  }

  return result;
}

async function processBlock(blockNumber) {
  try {
    const block = await client.getBlock({
      blockNumber,
      includeTransactions: true,
    });

    console.log(`\n📦 Processing block ${blockNumber} with ${block.transactions.length} transactions`);

    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue; // Skip if only hash returned

      const classification = classifyTransaction(tx);

      if (classification.isBuilder || classification.isDegen) {
        await updateWalletScore(
          tx.from,
          classification.builderPoints,
          classification.degenPoints
        );
      }
    }

    await updateLastProcessedBlock(blockNumber);
  } catch (error) {
    console.error(`Error processing block ${blockNumber}:`, error.message);
  }
}

async function runIndexer() {
  console.log('🚀 Starting Degen vs Builder Indexer...');
  console.log(`📡 Connected to Base at ${process.env.BASE_RPC_URL || 'https://mainnet.base.org'}`);

  // Get current block and last processed block
  const currentBlock = await client.getBlockNumber();
  let lastProcessed = await getLastProcessedBlock();

  // If starting fresh, start from recent block (last 100 blocks)
  if (lastProcessed === 0n) {
    lastProcessed = currentBlock - 100n;
    console.log(`🆕 Starting fresh from block ${lastProcessed}`);
  }

  console.log(`📊 Current block: ${currentBlock}, Last processed: ${lastProcessed}`);

  // Process any missed blocks
  for (let blockNum = lastProcessed + 1n; blockNum <= currentBlock; blockNum++) {
    await processBlock(blockNum);
  }

  // Watch for new blocks
  console.log('\n👀 Watching for new blocks...');

  client.watchBlocks({
    onBlock: async (block) => {
      await processBlock(block.number);
    },
    onError: (error) => {
      console.error('Block watcher error:', error.message);
    },
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down indexer...');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the indexer
runIndexer().catch(console.error);
