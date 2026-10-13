import { useCallback } from 'react';
import { create } from 'zustand';
import locales from '@/locales';

export const SUPPORT_LOCALES = [
  {
    name: 'Tiếng Việt',
    value: 'vi',
    shortName: 'vi',
    flag: '🇻🇳',
    icon: 'vi',
  },
  {
    name: 'English',
    value: 'en',
    shortName: 'en',
    flag: '🇬🇧',
    icon: 'en',
  },
  {
    name: '简体中文',
    value: 'zh',
    shortName: 'zh',
    flag: '🇨🇳',
    icon: 'zh',
  },
];

const STORAGE_KEY = 'skyline_locale';

// Get initial locale from localStorage or browser
const getInitialLocale = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && locales[saved]) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return 'vi'; // Default to Vietnamese
};

// Global Zustand store for locale
export const useLocaleStore = create((set, get) => ({
  locale: getInitialLocale(),
  setLocale: (newLocale) => {
    if (!locales[newLocale]) return;
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch (e) {
      // ignore
    }
    set({ locale: newLocale });
  },
}));

/**
 * Universal translation function t(key, variables)
 * Compatible with legacy skyline-console t('Home')
 */
export const t = (key, variables = {}) => {
  if (!key) return '';
  const currentLocale = useLocaleStore.getState().locale;
  const dict = locales[currentLocale] || locales.vi || locales.en;

  let message = dict[key] !== undefined ? dict[key] : (locales.en[key] !== undefined ? locales.en[key] : key);

  if (variables && typeof variables === 'object') {
    Object.keys(variables).forEach((varKey) => {
      message = message.replace(new RegExp(`\\{${varKey}\\}`, 'g'), variables[varKey]);
    });
  }

  return message;
};

/**
 * React Hook for i18n
 */
export const useTranslation = () => {
  const { locale, setLocale } = useLocaleStore();

  const translate = useCallback(
    (key, variables) => {
      if (!key) return '';
      const dict = locales[locale] || locales.vi || locales.en;
      let message = dict[key] !== undefined ? dict[key] : (locales.en[key] !== undefined ? locales.en[key] : key);

      if (variables && typeof variables === 'object') {
        Object.keys(variables).forEach((varKey) => {
          message = message.replace(new RegExp(`\\{${varKey}\\}`, 'g'), variables[varKey]);
        });
      }

      return message;
    },
    [locale]
  );

  return {
    t: translate,
    locale,
    setLocale,
    locales: SUPPORT_LOCALES,
  };
};

const i18n = {
  t,
  SUPPORT_LOCALES,
  getLocale: () => useLocaleStore.getState().locale,
  setLocale: (locale) => useLocaleStore.getState().setLocale(locale),
};

export default i18n;
