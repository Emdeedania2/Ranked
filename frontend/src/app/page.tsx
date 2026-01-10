'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { normalize } from 'viem/ens';
import { createPublicClient, http } from 'viem';
import { mainnet, base } from 'viem/chains';
import { useWebSocket } from '@/hooks/useWebSocket';
import { initFarcasterMiniApp, openWarpcastCompose } from '@/lib/farcaster';

// Types
interface WalletScore {
  address: string;
  builderScore: number;
  degenScore: number;
  lastUpdated: string;
}

interface WalletDetails {
  address: string;
  builderScore: number;
  degenScore: number;
  builderRank: number;
  degenRank: number;
  totalWallets: number;
  builderPercentage: number;
  degenPercentage: number;
  personality: string;
  badges: string[];
  lastUpdated: string;
}

interface LeaderboardResponse {
  success: boolean;
  data: WalletScore[];
  meta: {
    count: number;
    type: string;
    lastBlockProcessed: string;
    lastUpdated: string | null;
    totalCount?: number;
  };
}

interface Activity {
  address: string;
  type: 'builder' | 'degen';
  score: number;
  timestamp: string;
}

// ENS/Basename resolution clients
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const baseClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Name resolution cache
const nameCache = new Map<string, string>();

// Utility functions
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function resolveAddressName(address: string): Promise<string> {
  if (nameCache.has(address)) {
    return nameCache.get(address)!;
  }

  try {
    // Try ENS first (mainnet)
    const ensName = await mainnetClient.getEnsName({
      address: address as `0x${string}`,
    });
    if (ensName) {
      nameCache.set(address, ensName);
      return ensName;
    }

    // Try Basename (Base L2 names) - check if address has a .base.eth name
    // Base names are resolved via the Base Name Service
    const baseName = await baseClient.getEnsName({
      address: address as `0x${string}`,
    }).catch(() => null);

    if (baseName) {
      nameCache.set(address, baseName);
      return baseName;
    }
  } catch (error) {
    console.log('Name resolution failed for', address);
  }

  return truncateAddress(address);
}

function triggerConfetti() {
  import('canvas-confetti').then((confetti) => {
    confetti.default({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#0052FF', '#FF6B00', '#22c55e'],
    });
  });
}

// Badge component
function Badge({ name }: { name: string }) {
  const badgeColors: Record<string, string> = {
    'Top 10 Builder': 'bg-blue-600',
    'Top 10 Degen': 'bg-orange-600',
    'Builder King': 'bg-yellow-500',
    'Degen King': 'bg-purple-600',
    'Balanced': 'bg-green-600',
    'Master Builder': 'bg-blue-500',
    'Mega Degen': 'bg-red-500',
    'Power User': 'bg-pink-500',
  };

  return (
    <span className={`${badgeColors[name] || 'bg-gray-600'} px-2 py-1 rounded-full text-xs font-medium text-white`}>
      {name}
    </span>
  );
}

// Animated counter component
function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setDisplayValue(Math.floor(progress * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{displayValue.toLocaleString()}</span>;
}

// Address display with name resolution
function AddressDisplay({ address, className = '' }: { address: string; className?: string }) {
  const [displayName, setDisplayName] = useState(truncateAddress(address));

  useEffect(() => {
    resolveAddressName(address).then(setDisplayName);
  }, [address]);

  return <span className={className}>{displayName}</span>;
}

// Live Activity Feed
function LiveFeed({ activities, wsConnected }: { activities: Activity[]; wsConnected?: boolean }) {
  return (
    <div className="base-card p-4 mb-8 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
          <span className="text-sm font-semibold text-foreground">Live Activity</span>
        </div>
        {wsConnected && (
          <span className="text-xs text-green-500">Real-time</span>
        )}
      </div>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-center justify-between text-sm animate-fade-in">
            <AddressDisplay address={activity.address} className="font-mono text-muted" />
            <span className={activity.type === 'builder' ? 'text-[#0052FF]' : 'text-[#FF6B00]'}>
              +{activity.score} {activity.type === 'builder' ? 'Builder' : 'Degen'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Wallet Search Component
function WalletSearch({ onSearch }: { onSearch: (address: string) => void }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSearch(input.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <input
        type="text"
        placeholder="Enter wallet address or ENS name..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="flex-1 px-4 py-2.5 bg-card border border-border rounded-full text-foreground placeholder-muted focus:outline-none focus:border-[#0052FF] transition-colors"
      />
      <button
        type="submit"
        className="base-button px-6 py-2.5 rounded-full text-sm font-semibold text-white"
      >
        Search
      </button>
    </form>
  );
}

// Personality Card Component
function PersonalityCard({ wallet, onClose, onShare }: { wallet: WalletDetails; onClose: () => void; onShare: () => void }) {
  useEffect(() => {
    triggerConfetti();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="base-card p-6 max-w-md w-full animate-scale-in">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-foreground mb-2">{wallet.personality}</h3>
          <AddressDisplay address={wallet.address} className="text-muted font-mono text-sm" />
        </div>

        {/* Score Bars */}
        <div className="space-y-4 mb-6">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-[#0052FF]">Builder</span>
              <span className="text-foreground"><AnimatedCounter value={wallet.builderPercentage} />%</span>
            </div>
            <div className="h-3 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0052FF] rounded-full transition-all duration-1000"
                style={{ width: `${wallet.builderPercentage}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-[#FF6B00]">Degen</span>
              <span className="text-foreground"><AnimatedCounter value={wallet.degenPercentage} />%</span>
            </div>
            <div className="h-3 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF6B00] rounded-full transition-all duration-1000"
                style={{ width: `${wallet.degenPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-3 bg-card-inner rounded-lg">
            <p className="text-2xl font-bold text-[#0052FF]">#{wallet.builderRank}</p>
            <p className="text-xs text-muted">Builder Rank</p>
          </div>
          <div className="text-center p-3 bg-card-inner rounded-lg">
            <p className="text-2xl font-bold text-[#FF6B00]">#{wallet.degenRank}</p>
            <p className="text-xs text-muted">Degen Rank</p>
          </div>
        </div>

        {/* Badges */}
        {wallet.badges.length > 0 && (
          <div className="mb-6">
            <p className="text-sm text-muted mb-2">Badges Earned</p>
            <div className="flex flex-wrap gap-2">
              {wallet.badges.map((badge) => (
                <Badge key={badge} name={badge} />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onShare}
            className="flex-1 base-button px-4 py-2.5 rounded-full text-sm font-semibold text-white"
          >
            Share Result
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-secondary hover:bg-secondary-hover rounded-full text-sm font-semibold text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Compare Mode Component
function CompareMode({ onClose }: { onClose: () => void }) {
  const [wallet1, setWallet1] = useState('');
  const [wallet2, setWallet2] = useState('');
  const [data1, setData1] = useState<WalletDetails | null>(null);
  const [data2, setData2] = useState<WalletDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const compare = async () => {
    if (!wallet1 || !wallet2) return;
    setLoading(true);

    const [res1, res2] = await Promise.all([
      fetch(`/api/wallet/${wallet1}`).then((r) => r.json()),
      fetch(`/api/wallet/${wallet2}`).then((r) => r.json()),
    ]);

    setData1(res1.data);
    setData2(res2.data);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="base-card p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-foreground mb-4 text-center">Compare Wallets</h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <input
            type="text"
            placeholder="Wallet 1 or ENS..."
            value={wallet1}
            onChange={(e) => setWallet1(e.target.value)}
            className="px-4 py-2.5 bg-card-inner border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-[#0052FF] text-sm"
          />
          <input
            type="text"
            placeholder="Wallet 2 or ENS..."
            value={wallet2}
            onChange={(e) => setWallet2(e.target.value)}
            className="px-4 py-2.5 bg-card-inner border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-[#0052FF] text-sm"
          />
        </div>

        <button
          onClick={compare}
          disabled={loading || !wallet1 || !wallet2}
          className="w-full base-button px-4 py-2.5 rounded-full text-sm font-semibold text-white mb-6 disabled:opacity-50"
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>

        {data1 && data2 && (
          <div className="grid grid-cols-2 gap-4">
            {[data1, data2].map((wallet, idx) => (
              <div key={idx} className="bg-card-inner p-4 rounded-lg">
                <AddressDisplay address={wallet.address} className="font-mono text-xs text-muted block mb-2" />
                <p className="text-lg font-bold text-foreground mb-3">{wallet.personality}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#0052FF]">Builder</span>
                    <span className="text-foreground">{wallet.builderScore} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#FF6B00]">Degen</span>
                    <span className="text-foreground">{wallet.degenScore} pts</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {wallet.badges.slice(0, 3).map((badge) => (
                    <Badge key={badge} name={badge} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2.5 bg-secondary hover:bg-secondary-hover rounded-full text-sm font-semibold text-foreground transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// Leaderboard Card Component
function LeaderboardCard({
  rank,
  wallet,
  type,
  onClick,
}: {
  rank: number;
  wallet: WalletScore;
  type: 'builder' | 'degen';
  onClick: () => void;
}) {
  const score = type === 'builder' ? wallet.builderScore : wallet.degenScore;
  const isBuilder = type === 'builder';
  const badgeClass = isBuilder ? 'builder-badge' : 'degen-badge';

  return (
    <div
      onClick={onClick}
      className="base-card flex items-center justify-between p-4 cursor-pointer hover:scale-[1.02] transition-transform"
    >
      <div className="flex items-center gap-4">
        <span className="text-2xl font-bold text-muted w-10">#{rank}</span>
        <div>
          <AddressDisplay
            address={wallet.address}
            className="font-mono text-sm text-foreground hover:text-[#0052FF] transition-colors"
          />
          <div className="text-xs text-muted mt-1">
            Builder: {wallet.builderScore} | Degen: {wallet.degenScore}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold text-foreground"><AnimatedCounter value={score} duration={500} /></span>
        <span className={`${badgeClass} px-4 py-1.5 rounded-full text-sm font-semibold text-white`}>
          {type === 'builder' ? 'Builder' : 'Degen'}
        </span>
      </div>
    </div>
  );
}

// Theme Toggle Component
function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="theme-toggle flex items-center justify-center w-10 h-10"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      )}
    </button>
  );
}

// Pagination Component
function Pagination({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex justify-center items-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1.5 bg-secondary hover:bg-secondary-hover rounded-lg text-sm font-medium text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <span className="text-muted text-sm px-4">
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 bg-secondary hover:bg-secondary-hover rounded-lg text-sm font-medium text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}

// Main Component
export default function Home() {
  const [activeTab, setActiveTab] = useState<'builder' | 'degen'>('builder');
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'all'>('all');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [data, setData] = useState<WalletScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LeaderboardResponse['meta'] | null>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletDetails | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Wagmi hooks
  const { address: connectedAddress, isConnected } = useAccount();

  // WebSocket for real-time updates
  const handleScoreUpdate = useCallback((update: {
    address: string;
    builderScore: number;
    degenScore: number;
    timestamp: number;
  }) => {
    // Add to live activity feed
    const newActivity: Activity = {
      address: update.address,
      type: update.builderScore > 0 ? 'builder' : 'degen',
      score: update.builderScore > 0 ? update.builderScore : update.degenScore,
      timestamp: new Date(update.timestamp).toISOString(),
    };

    setActivities((prev) => [newActivity, ...prev.slice(0, 9)]);

    // Update leaderboard data if this address exists
    setData((prev) =>
      prev.map((wallet) =>
        wallet.address === update.address
          ? {
              ...wallet,
              builderScore: update.builderScore,
              degenScore: update.degenScore,
            }
          : wallet
      )
    );
  }, []);

  const { isConnected: wsConnected } = useWebSocket({
    onScoreUpdate: handleScoreUpdate,
    enabled: true,
  });

  // Theme toggle handler
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      return newTheme;
    });
  }, []);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  // Auto-search connected wallet
  useEffect(() => {
    if (isConnected && connectedAddress) {
      handleSearch(connectedAddress);
    }
  }, [isConnected, connectedAddress]);

  // Initialize Frame SDK
  useEffect(() => {
    initFarcasterMiniApp().then(({ isInMiniApp }) => {
      setIsInMiniApp(isInMiniApp);
    });
  }, []);

  // Fetch leaderboard with pagination
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      const response = await fetch(`/api/leaderboard?type=${activeTab}&limit=${itemsPerPage}&offset=${offset}&time=${timeFilter}`);
      const result: LeaderboardResponse = await response.json();
      if (result.success) {
        setData(result.data);
        setMeta(result.meta);
      } else {
        setError('Failed to fetch leaderboard');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, timeFilter, currentPage]);

  // Fetch live activity
  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch('/api/activity');
      const result = await response.json();
      if (result.success) {
        setActivities(result.data);
      }
    } catch {
      console.log('Failed to fetch activity');
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard, fetchActivity]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, timeFilter]);

  // Search wallet
  const handleSearch = async (address: string) => {
    try {
      const response = await fetch(`/api/wallet/${address}`);
      const result = await response.json();
      if (result.success && result.data) {
        setSelectedWallet(result.data);
      } else {
        alert('Wallet not found in database');
      }
    } catch {
      alert('Failed to search wallet');
    }
  };

  // Share function
  const handleShare = async () => {
    if (!selectedWallet) return;

    const text = `I'm ${selectedWallet.builderPercentage}% Builder and ${selectedWallet.degenPercentage}% Degen on Base! My personality: ${selectedWallet.personality}\n\nCheck your score:`;

    if (isInMiniApp) {
      const opened = await openWarpcastCompose(text);
      if (!opened) {
        // Fallback to Twitter if Warpcast fails
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank');
      }
    } else {
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(twitterUrl, '_blank');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (activeTab === 'builder') return b.builderScore - a.builderScore;
    return b.degenScore - a.degenScore;
  });

  const totalPages = Math.max(1, Math.ceil((meta?.totalCount || meta?.count || 0) / itemsPerPage));

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      {/* Personality Modal */}
      {selectedWallet && (
        <PersonalityCard
          wallet={selectedWallet}
          onClose={() => setSelectedWallet(null)}
          onShare={handleShare}
        />
      )}

      {/* Compare Modal */}
      {showCompare && <CompareMode onClose={() => setShowCompare(false)} />}

      {/* Header */}
      <header className="text-center mb-8 relative">
        {/* Theme Toggle - positioned top right */}
        <div className="absolute right-0 top-0">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight text-foreground">
          Based or Degen?
        </h1>
        <p className="text-muted text-lg">Discover your onchain identity</p>
        {isInMiniApp && (
          <p className="text-xs text-[#0052FF] mt-2">Running in Base App</p>
        )}
        {meta && (
          <p className="text-xs text-muted-dark mt-2">
            Block #{meta.lastBlockProcessed} | {meta.lastUpdated ? new Date(meta.lastUpdated).toLocaleString() : 'Syncing...'}
          </p>
        )}
      </header>

      {/* Live Activity Feed */}
      {activities.length > 0 && <LiveFeed activities={activities} wsConnected={wsConnected} />}

      {/* Wallet Search */}
      <WalletSearch onSearch={handleSearch} />

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-center gap-3 mb-8">
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
            const connected = mounted && account && chain;
            return (
              <div className="flex gap-2">
                <button
                  onClick={connected ? openAccountModal : openConnectModal}
                  className="px-4 py-2 bg-[#0052FF] hover:bg-[#1A5CFF] rounded-full text-sm font-semibold text-white transition-colors"
                >
                  {connected ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                      {account.displayName}
                    </span>
                  ) : (
                    'Connect Wallet'
                  )}
                </button>
                {connected && (
                  <button
                    onClick={openAccountModal}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-full text-sm font-semibold text-white transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            );
          }}
        </ConnectButton.Custom>
        <button
          onClick={() => setShowCompare(true)}
          className="px-4 py-2 bg-secondary hover:bg-secondary-hover rounded-full text-sm font-semibold text-foreground transition-colors"
        >
          Compare Wallets
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex justify-center mb-4">
        <div className="bg-card p-1 rounded-full flex gap-1 border border-border">
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-8 py-2.5 rounded-full font-semibold transition-all ${
              activeTab === 'builder' ? 'bg-[#0052FF] text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Builders
          </button>
          <button
            onClick={() => setActiveTab('degen')}
            className={`px-8 py-2.5 rounded-full font-semibold transition-all ${
              activeTab === 'degen' ? 'bg-[#FF6B00] text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Degens
          </button>
        </div>
      </div>

      {/* Time Filter */}
      <div className="flex justify-center mb-8">
        <div className="flex gap-2">
          {(['day', 'week', 'all'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                timeFilter === filter
                  ? 'bg-secondary text-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {filter === 'day' ? '24h' : filter === 'week' ? '7d' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={fetchLeaderboard}
          disabled={loading}
          className="base-button px-6 py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="base-card text-center p-4 mb-6 border-red-500">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-border border-t-[#0052FF] rounded-full mx-auto mb-4"></div>
          <p className="text-muted">Loading leaderboard...</p>
        </div>
      )}

      {/* Leaderboard */}
      {!loading && !error && (
        <>
          <div className="space-y-3">
            {sortedData.length === 0 ? (
              <div className="base-card text-center py-16">
                <p className="text-foreground text-lg mb-2">No data yet</p>
                <p className="text-muted text-sm">Start the indexer to begin tracking wallet activity</p>
              </div>
            ) : (
              sortedData.map((wallet, index) => (
                <LeaderboardCard
                  key={wallet.address}
                  rank={(currentPage - 1) * itemsPerPage + index + 1}
                  wallet={wallet}
                  type={activeTab}
                  onClick={() => handleSearch(wallet.address)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {sortedData.length > 0 && totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {/* Footer */}
      <footer className="text-center mt-16 pt-8 border-t border-border">
        <div className="flex justify-center items-center gap-2 mb-4">
          <svg width="24" height="24" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="#0052FF"/>
          </svg>
          <span className="text-lg font-bold text-[#0052FF]">Built on Base</span>
        </div>
        <div className="flex justify-center items-center gap-2 mb-3">
          <span className="text-muted text-sm">Created by</span>
          <span className="text-[#0052FF] font-semibold text-sm">arabianchief.base.eth</span>
        </div>
        <p className="text-muted-dark text-xs mb-4">
          2+ Contract Deploys = Builder | 5+ In-App Trades = Degen
        </p>
        <p className="text-muted text-xs italic max-w-md mx-auto">
          <span className="text-[#0052FF]">Builders</span> create and deploy smart contracts, contributing to the ecosystem. <span className="text-[#FF6B00]">Degens</span> actively trade and interact with apps, driving onchain activity.
        </p>
      </footer>
    </main>
  );
}
