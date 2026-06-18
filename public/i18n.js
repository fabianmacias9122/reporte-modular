import { currentLang as legacyCurrentLang, setLang as setLegacyLang, t as legacyT } from '/i18n.js';

const LANG_STORAGE_KEY = 'rc-next.lang';
let currentLang = legacyCurrentLang === 'en' ? 'en' : 'es';

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

currentLang = readStoredLanguage();
applyDocumentLanguage(currentLang);
if (currentLang !== legacyCurrentLang) {
  setLegacyLang(currentLang);
}

export function getCurrentLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'es';
  if (currentLang !== legacyCurrentLang) {
    setLegacyLang(currentLang);
  }
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch {
    // ignore storage failures in local preview mode
  }
  applyDocumentLanguage(currentLang);
  return currentLang;
}

export function t(key, vars = {}) {
  return legacyT(key, vars);
}
