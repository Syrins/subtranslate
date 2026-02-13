"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { UserProfile, SubscriptionPlan } from "@/lib/api";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  plan: SubscriptionPlan | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    plan: null,
    loading: true,
    error: null,
  });

  const supabase = useMemo(() => createClient(), []);
  const mountedRef = useRef(true);
  // Track which user ID we last fetched profile for to avoid duplicate fetches
  const lastFetchedUserRef = useRef<string | null>(null);
  // Track whether we're currently fetching to prevent concurrent calls
  const fetchingRef = useRef(false);

  /**
   * Fetch profile + plan from the database.
   * Uses a completely independent Supabase query (no dependency on auth state changes).
   * Includes retry logic for transient abort errors.
   */
  const fetchProfile = useCallback(
    async (userId: string, session: Session) => {
      // Prevent concurrent fetches for the same user
      if (fetchingRef.current && lastFetchedUserRef.current === userId) {
        return;
      }
      fetchingRef.current = true;

      const maxRetries = 3;
      let attempt = 0;

      while (attempt < maxRetries) {
        attempt++;
        try {
          // Directly use fetch with the session token to bypass Supabase client's
          // internal AbortController which is tied to auth state changes.
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
          const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
          const headers = {
            apikey: supabaseKey,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          };

          // Fetch profile
          const profileRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
            {
              headers,
              cache: "no-store",
            }
          );

          if (!profileRes.ok) {
            throw new Error(`Profile fetch failed: ${profileRes.status}`);
          }

          const profiles = await profileRes.json();
          const profile = profiles.length > 0 ? profiles[0] : null;

          if (!mountedRef.current) return;

          // Fetch plan if profile has a plan_id
          let plan: SubscriptionPlan | null = null;
          if (profile?.plan_id) {
            const planRes = await fetch(
              `${supabaseUrl}/rest/v1/subscription_plans?id=eq.${profile.plan_id}&select=*`,
              {
                headers,
                cache: "no-store",
              }
            );

            if (planRes.ok) {
              const plans = await planRes.json();
              plan = plans.length > 0 ? plans[0] : null;
            }
          }

          if (!mountedRef.current) return;

          lastFetchedUserRef.current = userId;
          fetchingRef.current = false;

          setState((prev) => ({
            ...prev,
            profile: profile as UserProfile | null,
            plan,
            loading: false,
            error: null,
          }));
          return; // Success — exit retry loop

        } catch (err) {
          if (!mountedRef.current) {
            fetchingRef.current = false;
            return;
          }

          const isAbort =
            err instanceof DOMException && err.name === "AbortError";
          const isTransient =
            isAbort ||
            (err instanceof Error && err.message.includes("AbortError")) ||
            (err instanceof Error && err.message.includes("signal is aborted"));

          if (isTransient && attempt < maxRetries) {
            // Wait before retrying, with exponential backoff
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }

          // Final failure
          console.error("[useAuth] fetchProfile error:", err);
          fetchingRef.current = false;
          setState((prev) => ({
            ...prev,
            loading: false,
            error:
              err instanceof Error ? err.message : "Profile fetch failed",
          }));
          return;
        }
      }

      fetchingRef.current = false;
    },
    [] // No dependency on supabase client
  );

  useEffect(() => {
    mountedRef.current = true;
    lastFetchedUserRef.current = null;
    fetchingRef.current = false;

    /**
     * KEY FIX: We do NOT call getSession() separately.
     * Instead, we rely entirely on onAuthStateChange which fires
     * INITIAL_SESSION synchronously when the listener is registered.
     * This prevents the race condition where getSession() + onAuthStateChange
     * both trigger simultaneously, causing Supabase's internal AbortController
     * to cancel in-flight PostgREST requests.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      // No session = not logged in
      if (!session?.user) {
        lastFetchedUserRef.current = null;
        fetchingRef.current = false;
        setState({
          user: null,
          session: null,
          profile: null,
          plan: null,
          loading: false,
          error: null,
        });
        return;
      }

      // Update user/session immediately (this is synchronous and safe)
      setState((prev) => ({
        ...prev,
        user: session.user,
        session,
        // Only show loading if we don't have profile data yet
        loading: prev.profile === null && prev.user?.id !== session.user.id,
        error: null,
      }));

      // For TOKEN_REFRESHED, skip profile refetch if we already have it
      if (event === "TOKEN_REFRESHED" && lastFetchedUserRef.current === session.user.id) {
        return;
      }

      // Fetch profile data using direct REST API (bypasses AbortController issues)
      await fetchProfile(session.user.id, session);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
        return false;
      }
      // onAuthStateChange will handle setting user/session/profile
      return true;
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
        return false;
      }
      return true;
    },
    [supabase]
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setState((prev) => ({ ...prev, error: error.message }));
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    lastFetchedUserRef.current = null;
    fetchingRef.current = false;
    setState({
      user: null,
      session: null,
      profile: null,
      plan: null,
      loading: false,
      error: null,
    });
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (state.user && state.session) {
      lastFetchedUserRef.current = null; // Force refetch
      fetchingRef.current = false;
      await fetchProfile(state.user.id, state.session);
    }
  }, [state.user, state.session, fetchProfile]);

  return {
    ...state,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshProfile,
    isAdmin: state.profile?.role === "admin",
  };
}
