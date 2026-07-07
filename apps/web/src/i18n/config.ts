import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import zhCN from "./locales/zh_CN.json";
import zhTW from "./locales/zh_TW.json";
import jaJP from "./locales/ja_JP.json";
import idID from "./locales/id_ID.json";

/**
 * Languages shown in the LanguageSwitch menu. `code` is the canonical i18next
 * language; `name` matches the labels used in the status-page prototype.
 */
export const LANGUAGES = [
  { code: "en", name: "English (en)" },
  { code: "id", name: "Bahasa Indonesia (id)" },
  { code: "ja", name: "日本語 (ja)" },
  { code: "zh-CN", name: "简体中文 (zh)" },
  { code: "zh-TW", name: "繁體中文 (zh-tw)" }
] as const;

// Register the 5 canonical languages plus common regional aliases so browser
// detection (e.g. `zh`, `zh-HK`, `en-US`) resolves to the right resource.
const resources = {
  en: { translation: en },
  "en-US": { translation: en },
  "en-GB": { translation: en },
  id: { translation: idID },
  "id-ID": { translation: idID },
  ja: { translation: jaJP },
  "ja-JP": { translation: jaJP },
  "zh-CN": { translation: zhCN },
  "zh-Hans": { translation: zhCN },
  zh: { translation: zhCN },
  "zh-SG": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  "zh-Hant": { translation: zhTW },
  "zh-HK": { translation: zhTW },
  "zh-MO": { translation: zhTW }
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "zh-CN",
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "nb-lang"
    },
    interpolation: { escapeValue: false }
  });

export default i18n;
