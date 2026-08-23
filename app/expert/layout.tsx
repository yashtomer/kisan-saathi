import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Case queue | Kisan Saathi',
  description:
    'Farmer cases raised by the Kisan Saathi voice agent, waiting for an agronomist.',
};

export default function ExpertLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
