import { useState, useRef, useCallback } from "react";

// Pull-to-refresh tuning (touch gesture)
const PULL_THRESHOLD = 72; // px the user must pull down before a refresh fires
const PULL_MAX = 110; // hard cap on how far the indicator travels
const PULL_RESISTANCE = 0.4; // finger movement past the threshold is damped by this factor

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  isFetchingRef: React.MutableRefObject<boolean>;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
  handlePullTouchStart: (e: React.TouchEvent) => void;
  handlePullTouchMove: (e: React.TouchEvent) => void;
  handlePullTouchEnd: () => void;
}

export function usePullToRefresh({
  onRefresh,
  isFetchingRef,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const pullStartYRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isAtScrollTop = () =>
    (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  const handlePullTouchStart = useCallback((e: React.TouchEvent) => {
    // Only arm the gesture when idle and already scrolled to the very top.
    if (isRefreshing || isFetchingRef.current) return;
    if (!isAtScrollTop()) return;
    pullStartYRef.current = e.touches[0].clientY;
    pullActiveRef.current = true;
  }, [isRefreshing, isFetchingRef]);

  const handlePullTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullActiveRef.current || pullStartYRef.current === null) return;
    // Abort if the user has scrolled away from the top mid-gesture.
    if (!isAtScrollTop()) {
      pullActiveRef.current = false;
      pullStartYRef.current = null;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    // 1:1 up to the threshold, damped past it, hard-capped at PULL_MAX.
    const damped =
      delta <= PULL_THRESHOLD
        ? delta
        : PULL_THRESHOLD + (delta - PULL_THRESHOLD) * PULL_RESISTANCE;
    setPullDistance(Math.min(damped, PULL_MAX));
  }, []);

  const handlePullTouchEnd = useCallback(() => {
    if (!pullActiveRef.current) return;
    pullActiveRef.current = false;
    pullStartYRef.current = null;
    if (pullDistance >= PULL_THRESHOLD && !isFetchingRef.current) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      Promise.resolve(onRefresh()).finally(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      });
    } else {
      // Released before the threshold — snap back with no refresh.
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh, isFetchingRef]);

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return {
    pullDistance,
    isRefreshing,
    pullProgress,
    handlePullTouchStart,
    handlePullTouchMove,
    handlePullTouchEnd,
  };
}
