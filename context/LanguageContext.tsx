'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { Language, translations, Translations } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: translations.en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('panelverse_language');
      document.documentElement.lang = 'en';
    }
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        language: 'en',
        setLanguage: () => {},
        toggleLanguage: () => {},
        t: translations.en,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
