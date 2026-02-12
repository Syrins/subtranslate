"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Hook that re-fetches data when:
 * 1. Component mounts
 * 2. User navigates back to this page (pathname match)
 * 3. Browser tab regains focus (visibilitychange)
 *
 * This solves the stale data problem where Next.js client components
 * don't unmount on navigation, so useEffect([]) only runs once.
 */
export function useFetchOnFocus<T>(
  fetcher: () => Promise<T>,
  options: {
    /** If set, only refetch when pathname starts with this */
    pathPrefix?: string;
    /** Minimum ms between refetches (default 3000) */
    dedupMs?: number;
    /** Don't fetch on mount (default false) */
    skipInitial?: boolean;
  } = {}
): {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
} {
  const { pathPrefix, dedupMs = 3000, skipInitial = false } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(!skipInitial);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchRef = useRef(0);
  const mountedRef = useRef(true);
  const pathname = usePathname();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < dedupMs) return;
    lastFetchRef.current = now;

    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [dedupMs]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (!skipInitial) {
      doFetch();
    }
    return () => {
      mountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when pathname changes back to this page
  useEffect(() => {
    if (pathPrefix && !pathname.startsWith(pathPrefix)) return;
    doFetch();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (pathPrefix && !window.location.pathname.startsWith(pathPrefix)) return;
        doFetch();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [doFetch, pathPrefix]);

  return { data, loading, error, refetch: doFetch, setData };
}
