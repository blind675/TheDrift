import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { completeAuthFromUrl, requestMagicLink } from '@/lib/auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
  authError: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const processedUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const client = getSupabase();
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      setSession(data.session);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;
    const handleUrl = (url: string | null) => {
      if (!mounted || !url || processedUrl.current === url || !url.includes('auth/callback')) return;

      processedUrl.current = url;
      setAuthError(null);
      void completeAuthFromUrl(url)
        .catch((error: unknown) => {
          if (!mounted) return;
          setAuthError(error instanceof Error ? error.message : 'The sign-in link could not be completed.');
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };

    void Linking.getInitialURL().then(handleUrl).catch((error: unknown) => {
      if (mounted) {
        setAuthError(error instanceof Error ? error.message : 'The sign-in link could not be read.');
      }
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      await requestMagicLink(email);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The magic link could not be sent.';
      setAuthError(message);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ session, loading, authError, sendMagicLink, signOut }),
    [authError, loading, sendMagicLink, session, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}
