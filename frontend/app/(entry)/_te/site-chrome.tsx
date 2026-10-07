'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CONTACT } from '@/lib/site-content';
import { Wordmark } from './parts';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  // Contact is a WhatsApp chat, not a page.
  { href: CONTACT.whatsappUrl, label: 'Contact' },
] as const;

function NavLink({ href, label, active, onClick }: { href: string; label: string; active: boolean; onClick?: () => void }) {
  const cls = `nl${active ? ' act' : ''}`;
  return href.startsWith('http') ? (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>{label}</a>
  ) : (
    <Link className={cls} href={href} aria-current={active ? 'page' : undefined} onClick={onClick}>{label}</Link>
  );
}

function Header({ active }: { active: '/' | '/about' }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="hdr-wrap">
      <header className={`hdr fi${scrolled ? ' on' : ''}`}>
        <div className="hdr-l">
          <Wordmark />
          <nav className="navlinks" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} active={n.href === active} />
            ))}
          </nav>
        </div>
        <div className="hdr-r">
          <Link className="tl signin" href="/login">Sign in</Link>
          <Link className="btn btn-p btn-sm join" href="/register">Join now</Link>
          <button className="burger" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
      {open ? (
        <nav className="mnav" aria-label="Menu">
          {NAV.map((n) => (
            <NavLink key={n.href} href={n.href} label={n.label} active={n.href === active} onClick={() => setOpen(false)} />
          ))}
          <Link className="nl" href="/register" onClick={() => setOpen(false)}>Join now</Link>
        </nav>
      ) : null}
    </div>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="fgrid">
        <div className="fbrand">
          <span className="fbrand-n"><Image src="/entry/logo.svg" alt="" width={28} height={28} />Tahir Elshazli</span>
          <span className="fbrand-t">IGCSE English, explained so it finally makes sense.</span>
        </div>
        <nav className="fcol" aria-label="About">
          <span>About</span>
          <Link className="fl" href="/about">Tahir Elshazli</Link>
          <a className="fl" href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a>
        </nav>
        <nav className="fcol" aria-label="Account">
          <span>Account</span>
          <Link className="fl" href="/login">Sign in</Link>
          <Link className="fl" href="/register">Join now</Link>
        </nav>
      </div>
      <div className="fbar">
        <span>© Tahir Elshazli 2026</span>
        <Link className="fl" href="/privacy">Privacy</Link>
        <Link className="fl" href="/terms">Terms</Link>
      </div>
      <div className="fword" aria-hidden="true">Tahir Elshazli</div>
    </footer>
  );
}

/** Header + dark footer shared by Home and About. The page goes in the white rounded body. */
export function SiteChrome({ active, children }: { active: '/' | '/about'; children: React.ReactNode }) {
  return (
    <div className="te--night">
      <Header active={active} />
      <main id="main" className="main">
        {children}
      </main>
      <Footer />
    </div>
  );
}
