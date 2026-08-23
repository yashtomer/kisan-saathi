import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Noto_Sans_Devanagari,
} from 'next/font/google';

/**
 * Typography and light-theme wrapper for the agronomist dashboard.
 *
 * Lives in a component rather than a route layout so both `/` and `/expert`
 * render identically without duplicating the font setup.
 */

// Display face: enough character to carry a wordmark without a logo file.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

// Body face covers Devanagari and Latin, so a farmer's own words and the
// interface chrome share one set of shapes.
const body = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

// Case IDs, counts and timestamps — anything that lines up in a column.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-data',
  display: 'swap',
});

export default function ExpertShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`expert-surface ${display.variable} ${body.variable} ${mono.variable}`}
      style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}
    >
      {children}
    </div>
  );
}
