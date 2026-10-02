import type { Metadata } from 'next';
import { LegalDocument } from '@/components/site/legal-document';
import { TERMS_OF_USE } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms that apply to everyone who visits the public website or uses an account on the Platform.',
};

export default function TermsPage() {
  return <LegalDocument doc={TERMS_OF_USE} />;
}
