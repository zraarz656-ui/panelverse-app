import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext';

export const metadata: Metadata = {
  title: 'PanelVerse — Webtoon & Manga Reader',
  description:
    'Next-generation webtoon and manga reader featuring continuous scroll webtoon mode, paged RTL manga mode, community comments, requests, and release schedule.',
  openGraph: {
    title: 'PanelVerse — Webtoon & Manga Reader',
    description:
      'Next-generation webtoon and manga reader featuring continuous scroll webtoon mode, paged RTL manga mode, community comments, requests, and release schedule.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PanelVerse — Webtoon & Manga Reader',
    description:
      'Next-generation webtoon and manga reader featuring continuous scroll webtoon mode, paged RTL manga mode, community comments, requests, and release schedule.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark scroll-smooth">
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-rose-500/30 selection:text-rose-200"
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
