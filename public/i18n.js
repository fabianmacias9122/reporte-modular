const LANG_STORAGE_KEY = 'rc-next.lang';

const TRANSLATIONS = {
  es: {},
  en: {},
};

function readStoredLanguage() {
  try {
    const storedValue = localStorage.getItem(LANG_STORAGE_KEY);
    return storedValue === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

function applyDocumentLanguage(lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export let currentLang = readStoredLanguage();
applyDocumentLanguage(currentLang);

export function getCurrentLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'es';
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch {
    // ignore storage failures in local preview mode
  }
  applyDocumentLanguage(currentLang);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('rc:langchange', { detail: { lang: currentLang } }));
  }
  return currentLang;
}

export function t(key, vars = {}) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.es;
  const template = dict[key] ?? TRANSLATIONS.es[key] ?? key;
  return interpolate(template, vars);
}

export function applyStaticTranslations(root = document) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (!key) return;
    element.textContent = t(key);
  });
}
