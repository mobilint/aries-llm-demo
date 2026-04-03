import enTexts from "./i18n/en.json";
import koTexts from "./i18n/ko.json";
import jaTexts from "./i18n/ja.json";
import zhTexts from "./i18n/zh.json";
import { exampleQuestionsByLanguage } from "./questions/catalog";

export type LanguageText = {
  sidebarTitle: string,
  greetingTitle: string,
  greetingDescription: string[],
  inputPlaceholder: string,
  languageLabel: string,
  autoLabel: string,
  loadingPreparingModels: string,
  loadingSwitchingModel: string,
  loadingModelDescription: string,
  statusConnecting: string,
  statusLoadingModels: string,
  statusPreparingPromptBundle: string,
};

export const DEFAULT_LANGUAGE = "ja";
export const AVAILABLE_LANGUAGES = ["ja", "en"] as const;

export type PromptBundle = {
  system_prompt: string,
  inter_prompt: string,
};

export const example_questions_by_language = exampleQuestionsByLanguage;

export const language_labels: Record<string, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  zh: "中文",
};

export const language_texts: Record<string, LanguageText> = {
  en: enTexts,
  ko: koTexts,
  ja: jaTexts,
  zh: zhTexts,
};

export function getLanguageTexts(language: string): LanguageText {
  return language_texts[language] ?? language_texts[DEFAULT_LANGUAGE];
}

export function formatLoadingModelDescription(language: string, modelName: string): string {
  return getLanguageTexts(language).loadingModelDescription.replace("{model}", modelName);
}

export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;

export const EXAMPLE_MODE_PAUSE_MS = 3 * 1000;

export async function loadPromptBundle(language: string): Promise<PromptBundle> {
  const locale = AVAILABLE_LANGUAGES.includes(language as typeof AVAILABLE_LANGUAGES[number])
    ? language
    : DEFAULT_LANGUAGE;

  const [systemPrompt, interPrompt] = await Promise.all([
    fetch(`/prompt-bundles/${locale}/system.txt`).then((response) => response.text()),
    fetch(`/prompt-bundles/${locale}/inter.txt`).then((response) => response.text()),
  ]);

  return {
    system_prompt: systemPrompt.trim(),
    inter_prompt: interPrompt.trim(),
  };
}
