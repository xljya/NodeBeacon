import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import zhCN from "./locales/zh_CN.json";
import zhTW from "./locales/zh_TW.json";

/**
 * Languages shown in the LanguageSwitch menu, in the requested display order.
 * `code` is the canonical i18next language.
 */
export const LANGUAGES = [
  { code: "zh-CN", name: "简体中文 (zh)" },
  { code: "zh-TW", name: "繁體中文 (zh-tw)" },
  { code: "en", name: "English (en)" }
] as const;

// Register the supported languages plus common regional aliases.
const resources = {
  en: { translation: en },
  "en-US": { translation: en },
  "en-GB": { translation: en },
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
    fallbackLng: "en",
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    detection: {
      // A saved visitor choice takes precedence; otherwise use English.
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "nb-lang"
    },
    interpolation: { escapeValue: false }
  });

// Keep the document language in sync so the browser can select the matching
// Simplified or Traditional Chinese font fallback stack.
i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

export default i18n;
