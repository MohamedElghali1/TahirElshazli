import type { Metadata } from 'next';
import Link from 'next/link';
import { Arrow, Decos, HeroPhoto, Underlined } from './_te/parts';
import { SiteChrome } from './_te/site-chrome';

export const metadata: Metadata = {
  title: { absolute: 'Tahir Elshazli | IGCSE English' },
  description:
    'Learn English with a teacher who makes it click. Clear explanations, weekly practice and real exam strategy for IGCSE students.',
};

export default function HomePage() {
  return (
    <SiteChrome active="/">
      <div className="wrap">
        <section className="card hero">
          <Decos />
          <div className="pill bi" style={{ animationDelay: '60ms' }}>
            <b>IGCSE English</b>
            <span>· live &amp; recorded lessons</span>
          </div>
          <h1 className="h1 bi" style={{ animationDelay: '100ms' }}>
            Learn English with a teacher who <Underlined>makes it click.</Underlined>
          </h1>
          <p className="sub bi" style={{ animationDelay: '800ms' }}>
            Clear explanations, weekly practice and real exam strategy — for IGCSE students who want top marks without the stress.
          </p>
          <div className="ctas bi" style={{ animationDelay: '880ms' }}>
            <Link className="btn btn-p" href="/register">Start learning</Link>
            <Link className="btn btn-e" href="/about">
              Meet Tahir Elshazli <Arrow />
            </Link>
          </div>
          <HeroPhoto className="hero-img ru" priority />
        </section>
      </div>
    </SiteChrome>
  );
}
