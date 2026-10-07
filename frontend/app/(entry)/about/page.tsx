import type { Metadata } from 'next';
import Link from 'next/link';
import { Arrow, Decos, HeroPhoto, Underlined } from '../_te/parts';
import { CONTACT } from '@/lib/site-content';
import { FEEDBACK, STATS } from '../_te/about-content';
import { SiteChrome } from '../_te/site-chrome';

export const metadata: Metadata = {
  title: { absolute: 'About | Tahir Elshazli' },
  description:
    'Meet Tahir Elshazli, an English teacher on a mission to make English the subject you are best at.',
};

const METHOD = [
  {
    title: 'Explain',
    body: 'Every idea broken into steps you can actually follow.',
    bg: '#FEF3C7',
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 48 48" fill="none" stroke="#A16207" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 6 C15 6 10 13 10 19 C10 25 15 28 17 33 L31 33 C33 28 38 25 38 19 C38 13 33 6 24 6 Z M18 38 L30 38 M20 43 L28 43" />
      </svg>
    ),
  },
  {
    title: 'Practice',
    body: 'Weekly problem sets that build speed and confidence.',
    bg: '#FDEBDD',
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 48 48" fill="none" stroke="#C2410C" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 38 L12 29 L31 10 L38 17 L19 36 Z M27 14 L34 21 M12 29 L19 36" />
      </svg>
    ),
  },
  {
    title: 'Master',
    body: 'Exam strategy and past papers until nothing surprises you.',
    bg: '#E6F4EA',
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#188038" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    ),
  },
] as const;

export default function AboutPage() {
  return (
    <SiteChrome active="/about">
      <div className="wrap">
        <section className="card hero">
          <Decos />
          <div className="pill bi" style={{ animationDelay: '60ms', color: 'var(--te-blue)', fontWeight: 600 }}>
            About
          </div>
          <h1 className="h1 h1--about bi" style={{ animationDelay: '120ms' }}>
            Meet <Underlined>Tahir Elshazli.</Underlined>
          </h1>
          <p className="sub bi" style={{ animationDelay: '220ms', maxWidth: 600 }}>
            An English teacher on a mission to make English the subject you’re best at.
          </p>
          <HeroPhoto className="hero-img ru" priority />
        </section>

        <section className="card quote-card rv">
          <span className="qmark" aria-hidden="true">“</span>
          <p className="t2">
            I started teaching because I was once the student who didn’t get it.{' '}
            <span>
              Every chapter I teach is the explanation I wish someone had given me. Clear steps, real examples, and practice until it feels easy.
            </span>
          </p>
        </section>

        <section id="results" className="card stats-card rv">
          <div className="stats">
            {STATS.map((s) => (
              <div className="stat" key={s.label}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card method rv">
          <h2>Simple method. Serious results.</h2>
          {METHOD.map((m) => (
            <div className="row" key={m.title}>
              <span className="dot" style={{ background: m.bg }}>{m.icon}</span>
              <span className="rt">{m.title}</span>
              <span className="rd">{m.body}</span>
            </div>
          ))}
        </section>

        <section className="card fb-card rv">
          <figure className="fb">
            <span className="qmark" aria-hidden="true">“</span>
            <blockquote>{FEEDBACK.quote}</blockquote>
            <figcaption>
              <span className="av" aria-hidden="true">{FEEDBACK.name.replace('[', '').charAt(0)}</span>
              <span className="who">
                <b>{FEEDBACK.name}</b>
                <span>{FEEDBACK.detail}</span>
              </span>
            </figcaption>
          </figure>
        </section>

        <section className="card cta-card">
          <h2 className="rv">
            Ready when you are.
            <br />
            <Underlined scroll>Let’s make it click.</Underlined>
          </h2>
          <p className="rv">Bring your hardest question.</p>
          <div className="ctas rv">
            <Link className="btn btn-p" href="/register">Start learning</Link>
            <a className="btn btn-e" href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer">
              Contact me <Arrow />
            </a>
          </div>
          <HeroPhoto className="hero-img rv" />
        </section>
      </div>
    </SiteChrome>
  );
}
