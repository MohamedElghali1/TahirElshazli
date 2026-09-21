'use client';

import * as React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * The single 40px page header (TASK 2 of the Twenty visual-parity pass).
 *
 * There is no `app/(app)/manage/layout.tsx` header of its own and `AppShell`
 * used to render a second, near-empty 56px bar above whatever `PageHeader`
 * a page chose to draw below it - two stacked bars on every `/manage/*`
 * route. This is the plumbing that collapses them into one: `AppShell`
 * renders the bar and reads its contents from here; a page or layout sets
 * them by rendering `<PageTitle>` / `<PageActions>` as a normal child.
 *
 * Two setters rather than one object, because they change on different
 * cadences. `PageTitle` is set by the page itself and changes on every
 * navigation. `PageActions` is set once by `app/(app)/manage/layout.tsx`,
 * which persists across every `/manage/*` route, so the action button is
 * never re-registered on a per-page basis.
 *
 * `children` passed into `PageChromeProvider` is the exact element `AppShell`
 * received from its own caller, so a chrome update here never re-renders the
 * page tree underneath it - React bails out of reconciling an unchanged
 * `children` reference. Only the header itself, which reads the context,
 * re-renders.
 */
interface Chrome {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  /**
   * A record-detail route (a course, a post) used to draw a `PageHeader`
   * breadcrumb back to its list. The single-line 40px bar has no room for
   * one, so this renders as a leading back arrow instead - the same
   * information, Twenty's own shape for it.
   */
  backHref?: string;
}

interface ChromeContextValue {
  chrome: Chrome | null;
  actions: React.ReactNode;
  setChrome: (chrome: Chrome | null) => void;
  setActions: (actions: React.ReactNode) => void;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, setChromeState] = useState<Chrome | null>(null);
  const [actions, setActionsState] = useState<React.ReactNode>(null);

  // Context updates reach every consumer that calls `useContext` regardless
  // of the `children`-identity bailout described above - so `PageTitle`
  // itself re-renders on every chrome change, not just the header, and its
  // effect (deps `[ctx, ...]`) fires again each time. Without this dedup, the
  // effect would call `setChrome({ icon, title })` with a *new* object every
  // time it fires, which never equals the previous state by reference, which
  // triggers another provider render, which fires the effect again -
  // forever. Bailing out to the previous state when the fields already match
  // is what makes that settle after one real update instead of looping.
  const setChrome = useCallback((next: Chrome | null) => {
    setChromeState((prev) => {
      if (prev === next) return prev;
      if (
        prev &&
        next &&
        prev.icon === next.icon &&
        prev.title === next.title &&
        prev.backHref === next.backHref
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const setActions = useCallback((next: React.ReactNode) => {
    setActionsState((prev) => (prev === next ? prev : next));
  }, []);

  const value = useMemo(
    () => ({ chrome, actions, setChrome, setActions }),
    [chrome, actions, setChrome, setActions],
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

/** What `AppShell`'s header renders. `null` outside a provider - never throws,
 *  since the marketing site and the auth screens mount no provider at all. */
export function usePageChrome(): { chrome: Chrome | null; actions: React.ReactNode } {
  const ctx = useContext(ChromeContext);
  return { chrome: ctx?.chrome ?? null, actions: ctx?.actions ?? null };
}

/**
 * A page sets its own header title (and optional leading icon) by rendering
 * this - it renders nothing itself. Cleared on unmount so a route that leaves
 * the header untouched never inherits the previous page's title.
 */
export function PageTitle({ icon, title, backHref }: Chrome) {
  const setChrome = useContext(ChromeContext)?.setChrome;
  useEffect(() => {
    setChrome?.({ icon, title, backHref });
    return () => setChrome?.(null);
    // `icon` is always a module-level Phosphor component reference, so it is
    // stable across renders and safe to depend on directly. Depending on
    // `setChrome` itself (a `useCallback` with `[]` deps in the provider)
    // rather than the whole context value: the value object is rebuilt
    // whenever `chrome`/`actions` state changes, which would otherwise
    // re-fire this effect on every chrome update from *any* consumer, not
    // just when this page's own title actually changes.
  }, [setChrome, icon, title, backHref]);
  return null;
}

/**
 * The header's right-hand side, set once by a layout that outlives the pages
 * under it (`app/(app)/manage/layout.tsx`) rather than by each page - the
 * action offered there is the same regardless of which `/manage/*` screen is
 * open.
 */
export function PageActions({ children }: { children: React.ReactNode }) {
  const setActions = useContext(ChromeContext)?.setActions;
  useEffect(() => {
    setActions?.(children);
    return () => setActions?.(null);
    // Same reasoning as `PageTitle`: depend on the stable `setActions`
    // function, not the whole context value. `children` is a fresh JSX
    // element every render (React never memoizes that for you) - without
    // this, a state update here rebuilds the context value, which re-fires
    // this same effect with an equally-fresh `children`, forever.
  }, [setActions, children]);
  return null;
}
