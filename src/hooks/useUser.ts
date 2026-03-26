// ============================================================
// FILE: src/hooks/useUser.ts
// Replaces the mock version — uses real Supabase Auth + DB role
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase, signInWithGoogle, signOut } from '../lib/supabase';
import type { User } from '../types';

async function buildUserFromSession(authUser: { id: string; email?: string }): Promise<User> {
  const email = authUser.email ?? '';

  // Fetch role from public.users (set by the trigger in 03_auth_and_functions.sql)
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();

  const role: 'admin' | 'participant' = data?.role === 'admin' ? 'admin' : 'participant';
  const namePart = email.split('@')[0];
  const name = namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/[._-]/g, ' ');

  return {
    email,
    name,
    role,
    initial: name[0]?.toUpperCase() ?? '?',
    assignedFormIds: [], // not needed — RLS handles form visibility
  };
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check for an existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = await buildUserFromSession(session.user);
        setUser(u);
      }
      setLoading(false);
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const u = await buildUserFromSession(session.user);
          setUser(u);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // login() kicks off the Google OAuth redirect — no email arg needed
  const login = useCallback(() => {
    signInWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  return { user, login, logout, loading, isAdmin: user?.role === 'admin' };
}
