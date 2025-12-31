import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './fr.json';
import wo from './wo.json';
import bm from './bm.json';

export const SUPPORTED_LANGUAGES = {
  fr: { code: 'fr', name: 'Français', nativeName: 'Français' },
  wo: { code: 'wo', name: 'Wolof', nativeName: 'Wolof' },
  bm: { code: 'bm', name: 'Bambara', nativeName: 'Bamanankan' },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

export const DEFAULT_LANGUAGE: LanguageCode = 'fr';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    wo: { translation: wo },
    bm: { translation: bm },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  compatibilityJSON: 'v4',
});

export default i18n;
