'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, User } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface TopNavbarProps {
  username?: string;
}

export function TopNavbar({ username }: TopNavbarProps) {
  const pathname = usePathname();
  const { t } = useLanguage();

  const navLinks = [
    { label: t.discover, href: '/' },
    { label: t.schedule, href: '/schedule' },
    { label: t.requests, href: '/requests' },
    { label: t.admin, href: '/admin' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 sm:gap-6 px-4 sm:px-6">
        {/* Zone 1: Wordmark Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm sm:text-base font-extrabold tracking-tight text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-600 to-indigo-600 text-white shadow-sm shrink-0">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="font-sans">PanelVerse</span>
        </Link>

        {/* Zone 2: Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-xs sm:text-sm font-medium text-slate-400">
          {navLinks.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Profile CTA */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* User Profile / Library Link */}
          <Link
            href="/me"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3.5 text-xs font-medium text-slate-200 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap select-none"
          >
            <User className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span className="max-w-[90px] sm:max-w-[130px] truncate leading-none">
              {username || t.myLibrary}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
