import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import i18n, {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LanguageCode,
} from '../i18n/config';

const LANGUAGE_STORAGE_KEY = '@yeli_vtc_language';

export type Language = LanguageCode;

export interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
}

interface LanguageContextValue {
  language: Language;
  languageInfo: LanguageInfo;
  setLanguage: (lang: Language) => Promise<void>;
  supportedLanguages: LanguageInfo[];
  isLoading: boolean;
  t: (key: string, options?: object) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

interface LanguageProviderProps {
  children: ReactNode;
}

// Storage interface for abstraction
interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

// In-memory storage for when AsyncStorage is not available
const memoryStorage: Record<string, string> = {};

// Try to get AsyncStorage dynamically at runtime
let asyncStorageModule: StorageAdapter | null = null;
let asyncStorageChecked = false;

const getAsyncStorage = async (): Promise<StorageAdapter | null> => {
  if (asyncStorageChecked) {
    return asyncStorageModule;
  }

  asyncStorageChecked = true;

  try {
    // Dynamic import with suppressed type checking for optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-async-storage/async-storage');
    const AsyncStorage = mod.default || mod;
    if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
      asyncStorageModule = AsyncStorage as StorageAdapter;
    }
  } catch {
    // AsyncStorage not available, use memory storage
  }

  return asyncStorageModule;
};

// Storage wrapper that uses AsyncStorage if available, otherwise memory
const storage: StorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const as = await getAsyncStorage();
    if (as) {
      return as.getItem(key);
    }
    return memoryStorage[key] ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const as = await getAsyncStorage();
    if (as) {
      await as.setItem(key, value);
    } else {
      memoryStorage[key] = value;
    }
  },
};

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    loadLanguagePreference();
  }, []);

  const isValidLanguage = (lang: string): lang is Language => {
    return lang in SUPPORTED_LANGUAGES;
  };

  const loadLanguagePreference = async () => {
    try {
      const storedLanguage = await storage.getItem(LANGUAGE_STORAGE_KEY);
      if (storedLanguage && isValidLanguage(storedLanguage)) {
        setLanguageState(storedLanguage);
        await i18n.changeLanguage(storedLanguage);
      }
    } catch (error) {
      console.warn('Failed to load language preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const persistLanguagePreference = async (lang: Language) => {
    try {
      await storage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (error) {
      console.warn('Failed to persist language preference:', error);
    }
  };

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    await i18n.changeLanguage(lang);
    await persistLanguagePreference(lang);
  }, []);

  const languageInfo: LanguageInfo = {
    code: language,
    name: SUPPORTED_LANGUAGES[language].name,
    nativeName: SUPPORTED_LANGUAGES[language].nativeName,
  };

  const supportedLanguages: LanguageInfo[] = Object.entries(
    SUPPORTED_LANGUAGES
  ).map(([code, info]) => ({
    code: code as Language,
    name: info.name,
    nativeName: info.nativeName,
  }));

  const value: LanguageContextValue = {
    language,
    languageInfo,
    setLanguage,
    supportedLanguages,
    isLoading,
    t,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE };
export type { LanguageCode };
