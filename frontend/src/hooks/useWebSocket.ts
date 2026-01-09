'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

interface ScoreUpdate {
  type: 'SCORE_UPDATE';
  data: {
    address: string;
    builderScore: number;
    degenScore: number;
    timestamp: number;
  };
}

interface UseWebSocketOptions {
  onScoreUpdate?: (data: ScoreUpdate['data']) => void;
  enabled?: boolean;
}

export function useWebSocket({ onScoreUpdate, enabled = true }: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ScoreUpdate | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ScoreUpdate;
          setLastMessage(message);

          if (message.type === 'SCORE_UPDATE' && onScoreUpdate) {
            onScoreUpdate(message.data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }, [enabled, onScoreUpdate]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    lastMessage,
  };
}
