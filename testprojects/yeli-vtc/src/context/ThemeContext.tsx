import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

const THEME_STORAGE_KEY = '@yeli_vtc_theme';

export interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  success: string;
  error: string;
  border: string;
}

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    primary: '#FF6B00',
    text: '#1A1A1A',
    textSecondary: '#666666',
    success: '#00C853',
    error: '#FF1744',
    border: '#E0E0E0',
  },
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#121212',
    surface: '#1E1E1E',
    primary: '#FF6B00',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    success: '#00E676',
    error: '#FF5252',
    border: '#333333',
  },
};

interface ThemeContextValue {
  theme: Theme;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
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

export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async (): Promise<void> => {
    try {
      const storedTheme = await storage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setThemeModeState(storedTheme);
      }
    } catch (error) {
      console.warn('Failed to load theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const persistThemePreference = async (mode: ThemeMode): Promise<void> => {
    try {
      await storage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.warn('Failed to persist theme preference:', error);
    }
  };

  const setThemeMode = useCallback((mode: ThemeMode): void => {
    setThemeModeState(mode);
    persistThemePreference(mode);
  }, []);

  const toggleTheme = useCallback((): void => {
    const newMode = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(newMode);
  }, [themeMode, setThemeMode]);

  const theme = themeMode === 'light' ? lightTheme : darkTheme;

  const value: ThemeContextValue = {
    theme,
    themeMode,
    toggleTheme,
    setThemeMode,
    isLoading,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
