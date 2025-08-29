'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
}

export function PullToRefresh({ 
  onRefresh, 
  children, 
  threshold = 80 
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const pullStarted = useRef(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh, isRefreshing]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;
    
    // Only start pull-to-refresh if at the top of the page
    if (container.scrollTop === 0) {
      setStartY(e.touches[0].clientY);
      pullStarted.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pullStarted.current || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      pullStarted.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY);
    
    if (distance > 0) {
      e.preventDefault();
      // Apply resistance effect
      const resistanceFactor = Math.min(distance / threshold, 1);
      const actualDistance = distance * (1 - resistanceFactor * 0.5);
      setPullDistance(Math.min(actualDistance, threshold * 1.5));
    }
  }, [startY, threshold, isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!pullStarted.current) return;
    
    pullStarted.current = false;
    
    if (pullDistance >= threshold && !isRefreshing) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, isRefreshing, handleRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const refreshProgress = Math.min(pullDistance / threshold, 1);
  const showRefreshIndicator = pullDistance > 0 || isRefreshing;

  return (
    <div ref={containerRef} className="flex-1 overflow-auto mobile-scroll">
      {/* Refresh indicator */}
      <div
        className={clsx(
          'flex items-center justify-center transition-all duration-200',
          showRefreshIndicator ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          height: Math.max(pullDistance, isRefreshing ? 60 : 0),
          transform: `translateY(${isRefreshing ? 0 : -20}px)`,
        }}
      >
        <div className="flex items-center justify-center">
          <RefreshCw
            className={clsx(
              'h-5 w-5 text-muted-foreground transition-transform duration-200',
              (isRefreshing || refreshProgress >= 1) && 'animate-spin'
            )}
            style={{
              transform: `rotate(${refreshProgress * 180}deg)`,
            }}
          />
          <span className="ml-2 text-sm text-muted-foreground">
            {isRefreshing
              ? 'Refreshing...'
              : refreshProgress >= 1
              ? 'Release to refresh'
              : 'Pull to refresh'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullStarted.current ? 'none' : 'transform 0.3s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}
