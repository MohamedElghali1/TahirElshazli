import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';

/**
 * The public marketing surface. `data-surface="site"` lifts the base font off
 * the 13px product default - CLAUDE.md §4 wants these pages read at arm's
 * length by a parent, not scanned by a student inside the app shell.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-surface="site" className="flex min-h-[100dvh] flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
