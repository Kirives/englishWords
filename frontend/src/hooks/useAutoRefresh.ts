import { useEffect } from "react";

interface UseAutoRefreshOptions {
  enabled?: boolean;
  intervalMs?: number;
}

export function useAutoRefresh(
  onRefresh: () => void,
  { enabled = true, intervalMs = 60_000 }: UseAutoRefreshOptions = {}
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleFocus = () => {
      onRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onRefresh();
      }
    };

    const intervalId = window.setInterval(() => {
      onRefresh();
    }, intervalMs);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, onRefresh]);
}