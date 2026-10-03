import type { Metadata } from 'next';
import { Header, Navbar } from './_za/landing';

export const metadata: Metadata = {
  title: { absolute: 'Home | Dr. Za3balawy' },
  description:
    'Chemistry made simple, logical and enjoyable. Learn IGCSE Chemistry with Mohamed Za3balawy — strong fundamentals, creative teaching and real clarity on every reaction.',
};

export default function HomePage() {
  return (
    <main id="main">
      <Navbar />
      <Header />
    </main>
  );
}
