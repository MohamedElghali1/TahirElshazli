import type { Metadata } from 'next';

export const metadata: Metadata = { title: { absolute: 'Sign in | Tahir Elshazli' } };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
