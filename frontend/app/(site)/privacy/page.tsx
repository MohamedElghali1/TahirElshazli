import type { Metadata } from 'next';
import { LegalDocument } from '@/components/site/legal-document';
import { PRIVACY_POLICY } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Dr. Tahir Elshazli - English Team collects, uses and protects your data on the Platform.',
};

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY_POLICY} />;
}
