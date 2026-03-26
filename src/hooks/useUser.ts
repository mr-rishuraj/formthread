// ============================================================
// FILE: src/hooks/useUser.ts
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase, signInWithGoogle, signOut } from '../lib/supabase';
import type { User } from '../types';

async function buildUserFromSession(authUser: { id: string; email?: string }): Promise<User> {
  const email = authUser.email ?? '';

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
    assignedFormIds: [],
  };
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // getSession is the correct way to restore session on refresh —
    // it reads from localStorage synchronously then validates with Supabase
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (cancelled) return;

      if (error) {
        console.error('getSession error:', error.message);
        setLoading(false);
        return;
      }

      if (session?.user) {
        try {
          const u = await buildUserFromSession(session.user);
          if (!cancelled) setUser(u);
        } catch (err) {
          console.error('buildUser failed:', err);
        }
      }

      if (!cancelled) setLoading(false);
    });

    // Also listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          return;
        }

        if (session?.user) {
          try {
            const u = await buildUserFromSession(session.user);
            if (!cancelled) {
              setUser(u);
              setLoading(false);
            }
          } catch (err) {
            console.error('buildUser on auth change failed:', err);
            if (!cancelled) setLoading(false);
          }
        } else {
          if (!cancelled) setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(() => {
    signInWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  return { user, login, logout, loading, isAdmin: user?.role === 'admin' };
}