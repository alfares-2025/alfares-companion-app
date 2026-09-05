import { Loader2, ChevronDown } from "lucide-react";

const PULL_THRESHOLD = 72; // px the user must pull down before a refresh fires

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  pullProgress,
}: PullToRefreshIndicatorProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      style={{
        transform: `translateY(${(isRefreshing ? PULL_THRESHOLD : pullDistance) - 44}px)`,
        opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
        transition:
          pullDistance > 0 && !isRefreshing
            ? "opacity 0.2s ease"
            : "transform 0.2s ease, opacity 0.2s ease",
      }}
    >
      <div className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e0e2e6] bg-white">
        {isRefreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#1b61c9" }} />
        ) : (
          <ChevronDown
            className="h-4 w-4"
            style={{
              color: pullProgress >= 1 ? "#1b61c9" : "#6B7280",
              transform: `rotate(${pullProgress * 180}deg)`,
              transition: "transform 0.12s linear, color 0.12s linear",
            }}
          />
        )}
      </div>
    </div>
  );
}
