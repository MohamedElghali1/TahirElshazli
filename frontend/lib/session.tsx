'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api';
import type { AuthenticatedUser, RegistrationResult } from './types';

/**
 * Session state for the logged-in student.
 *
 * The token lives in `sessionStorage`, not a cookie: the backend issues a
 * bearer JWT and every request sets the Authorization header itself, so there
 * is no cookie for CSRF to ride on. `sessionStorage` over `localStorage`
 * because it dies with the tab - a shared computer is the normal case for a
 * student sitting in a study centre.
 *
 * This is the interim shape. When the backend grows an httpOnly refresh-cookie
 * flow, only this file changes.
 */

const TOKEN_KEY = 'te.token';
const USER_KEY = 'te.user';

interface SessionValue {
  user: AuthenticatedUser | null;
  token: string | null;
  /** True until the first read of storage completes, so guards do not flash. */
  loading: boolean;
  /**
   * Returns the signed-in account, so the caller can route on its role
   * without waiting a render for `user` to land in state.
   */
  signIn: (email: string, password: string) => Promise<AuthenticatedUser>;
  /**
   * Accepts an assistant invitation and starts the session in one step
   * (`AUTH-4`) - unlike `register`, this account is `active` immediately.
   */
  acceptInvitation: (
    invitationToken: string,
    password: string,
  ) => Promise<AuthenticatedUser>;
  /**
   * Creates an account and **starts no session** (`DOM-4`, ruling R-6). The
   * account is `waiting` and cannot authenticate until staff accept it, so
   * there is no token to adopt and no user to route on - the caller shows a
   * "waiting for approval" state instead of navigating.
   */
  register: (
    name: string,
    email: string,
    password: string,
  ) => Promise<RegistrationResult>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function readStored(): { token: string; user: AuthenticatedUser } | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const raw = sessionStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    return { token, user: JSON.parse(raw) as AuthenticatedUser };
  } catch {
    // Private mode, blocked storage, or a corrupted value. Signed out is the
    // correct answer to all three.
    return null;
  }
}

function writeStored(token: string, user: AuthenticatedUser) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage refused. The session still works for this page load.
  }
}

function clearStored() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Storage is read after mount, not during render, and that is deliberate:
  // the server has no sessionStorage, so a lazy `useState(readStored)` would
  // render "signed out" on the server and "signed in" on the client and fail
  // hydration. `loading` exists precisely to cover this one frame, and the app
  // layout holds its guard until it clears.
  //
  // The React Compiler rule below flags synchronous setState in an effect,
  // which is the right default; this is the documented exception (syncing from
  // an external system that only exists in the browser), not a cascade.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(stored.token);
      setUser(stored.user);
    }
    setLoading(false);
  }, []);

  const adopt = useCallback(
    (result: { accessToken: string; user: AuthenticatedUser }) => {
      writeStored(result.accessToken, result.user);
      setToken(result.accessToken);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) =>
      adopt(await api.auth.login({ email, password })),
    [adopt],
  );

  const acceptInvitation = useCallback(
    async (invitationToken: string, password: string) =>
      adopt(await api.auth.acceptInvitation(invitationToken, password)),
    [adopt],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) =>
      api.auth.register({ name, email, password }),
    [],
  );

  const signOut = useCallback(async () => {
    const current = token;
    clearStored();
    setToken(null);
    setUser(null);
    router.push('/login');
    // Denylist the token server-side. A failure here is not worth blocking the
    // user on - they are already signed out locally.
    if (current) {
      try {
        await api.auth.logout(current);
      } catch {
        /* already invalid, or the API is down */
      }
    }
  }, [token, router]);

  const value = useMemo<SessionValue>(
    () => ({ user, token, loading, signIn, acceptInvitation, register, signOut }),
    [user, token, loading, signIn, acceptInvitation, register, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/**
 * Data hook for every authenticated screen. Returns the three states a data
 * surface actually has, so no screen ships with only its happy path.
 *
 * `deps` is the caller's dependency list; the fetcher is intentionally not in
 * it, because inline arrow fetchers change identity on every render.
 */
export function useApi<T>(
  fetcher: (token: string, signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | null; error: ApiError | null; loading: boolean; reload: () => void } {
  const { token, signOut } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let live = true;

    // Entering the loading state for a *new* request. Same exception as the
    // provider above: this synchronises React with an external system (the
    // API), and the alternative - rendering stale data from the previous
    // course while the new one loads - is a worse bug than an extra render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetcher(token, controller.signal)
      .then((result) => {
        if (!live) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!live || controller.signal.aborted) return;
        const err =
          cause instanceof ApiError
            ? cause
            : new ApiError(0, 'Something went wrong. Please try again.');
        // An expired token is not an error the screen should render - it is a
        // redirect to the login page.
        if (err.status === 401) {
          void signOut();
          return;
        }
        setError(err);
        setLoading(false);
      });

    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
