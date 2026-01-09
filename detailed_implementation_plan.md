# Degen vs Builder Scoreboard - Implementation Plan

**To Code Claude:**
This document outlines the architecture and execution steps for building the Degen vs Builder Scoreboard. Please read it carefully and implement the code accordingly.

---

## 1. Project Overview
**Goal:** categorize wallet activity on the Base blockchain as "Degen" (NFT/Token trading) or "Builder" (Contract deployment) and display it on a leaderboard.

**Architecture:**
- **Frontend:** Next.js (React) - Dashboard & Leaderboard.
- **Backend Service:** Node.js script using `viem` to poll Base blockchain data.
- **Database:** SQLite (via Prisma) or simple JSON store to persist weekly scores.
- **Smart Contract:** Simple Solidity contract on Base to store/verify weekly scores (Mini-App integration point).
- **Blockchain Utils:** `viem` for reading transaction history and decoding calldata.

---

## 2. Implementation Tasks

### Phase 1: Environment & Scaffolding
- [ ] Initialize a new monorepo-style structure or separate folders:
    - `/frontend` (Next.js)
    - `/backend` (Node.js)
    - `/contracts` (Hardhat/Foundry)
- [ ] Install dependencies:
    - Frontend: `npm install viem wagmi @tanstack/react-query next`
    - Backend: `npm install viem dotenv prisma @prisma/client` (or similar DB client)

### Phase 2: Backend Service (The Indexer)
- [ ] Create a Node.js script `indexer.js` that loops periodically (e.g., every 10 blocks or 1 minute).
- [ ] **Data Fetching:**
    - Use `viem` `publicClient.getBlock` or `watchBlocks` to get recent transactions.
- [ ] **Classification Logic:**
    - **Builder Activity:**
        - Check if `tx.to` is null (Contract Deployment).
        - Check signatures for "create" or known factory methods.
    - **Degen Activity:**
        - specific contract interactions (Uniswap/Aerodrome Router).
        - excessive transaction count in short periods.
        - checking transaction values/method IDs (e.g., `swapExactTokensForETH`).
- [ ] **Scoring System:**
    - Assign points (e.g., +10 Builder for deploy, +5 Degen for swap).
    - Store cumulative scores in the Database (Wallet Address -> {BuilderScore, DegenScore}).

### Phase 3: Smart Contract (On-Chain Anchoring)
- [ ] Write `ScoreRegistry.sol`:
    - Mapping `address => uint256 builderScore`
    - Mapping `address => uint256 degenScore`
    - Function `updateScores(address[], uint256[], uint256[])` restricted to `onlyOwner` (the backend service).
- [ ] Deploy this contract to Base Sepolia (testnet) or Base Mainnet.
    - *Note:* Make sure to handle private keys securely (.env).

### Phase 4: Frontend (The Dashboard)
- [ ] **UI Layout:**
    - Header: title "Base Degen vs Builder".
    - Main Content: Two columns or a toggle for "Top Degens" vs "Top Builders".
    - List Item: Rank, Wallet Address (truncated), Score, Badge (e.g., 🛠️ or 🎰).
    - "Refresh" button to re-fetch data from the backend/DB.
- [ ] **Integration:**
    - Create an API route in Next.js `/api/leaderboard` that reads from the Database.
    - (Optional) Use `wagmi` to read the on-chain `ScoreRegistry` for verification.

---

## 3. detailed_implementation_steps.md

### Step 1: Initialize Next.js App
```bash
npx create-next-app@latest frontend
cd frontend
npm install viem
```

### Step 2: Set up Backend Script
Create `backend/index.js`:
```javascript
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ 
  chain: base, 
  transport: http() 
});

async function main() {
  const block = await client.getBlock({ includeTransactions: true });
  for (const tx of block.transactions) {
    // Implement classification logic here
    if (!tx.to) {
       console.log(`Builder detected: ${tx.from} deployed a contract`);
       // Update DB
    }
  }
}
```

### Step 3: Smart Contract
Create `contracts/ScoreBoard.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ScoreBoard {
    mapping(address => uint256) public builderScores;
    mapping(address => uint256) public degenScores;
    address public owner;

    constructor() { owner = msg.sender; }

    function updateScore(address user, uint256 builder, uint256 degen) external {
        require(msg.sender == owner, "Only owner");
        builderScores[user] = builder;
        degenScores[user] = degen;
    }
}
```

---
**Note on Base Mini Apps:**
To eventually publish this as a Mini App, ensure the frontend is mobile-responsive and consider using the Farcaster Frame standard or MiniKit SDK in the future for "frictionless discovery". For now, a responsive web app is the correct first step.

**Good luck, Code Claude!**
