"use client";

import { useEffect, useState, useCallback } from "react";
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

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return;
    }

    let plan: SubscriptionPlan | null = null;
    if (profile?.plan_id) {
      const { data: planData } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", profile.plan_id)
        .single();
      plan = planData as SubscriptionPlan | null;
    }

    setState((prev) => ({
      ...prev,
      profile: profile as UserProfile,
      plan,
    }));
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setState((prev) => ({
          ...prev,
          user: session.user,
          session,
          loading: false,
        }));
        await fetchProfile(session.user.id);
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setState((prev) => ({
          ...prev,
          user: session?.user ?? null,
          session,
          loading: false,
        }));

        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setState((prev) => ({ ...prev, profile: null, plan: null }));
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return false;
    }
    return true;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
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
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setState((prev) => ({ ...prev, error: error.message }));
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({ user: null, session: null, profile: null, plan: null, loading: false, error: null });
  };

  const refreshProfile = async () => {
    if (state.user) {
      await fetchProfile(state.user.id);
    }
  };

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
