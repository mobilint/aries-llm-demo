import enQuestions from "./locales/en.json";
import jaQuestions from "./locales/ja.json";

export type ExampleQuestions = Record<string, string[]>;

type QuestionKey = keyof typeof enQuestions;
type LocaleQuestionMap = Record<QuestionKey, string>;

const QUESTION_SETS_BY_LANGUAGE: Record<string, LocaleQuestionMap> = {
  en: enQuestions,
  ja: jaQuestions,
};

const MODEL_GROUPS = {
  eques: [
    "EQUES/EAGLE3-JPharmatron-7B",
  ],
  qwen: [
    "Qwen/Qwen2.5-0.5B-Instruct",
    "Qwen/Qwen2.5-1.5B-Instruct",
    "Qwen/Qwen2.5-3B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
  ],
} as const;

const QUESTION_ORDER_BY_GROUP: Record<keyof typeof MODEL_GROUPS, QuestionKey[]> = {
  eques: Object.keys(enQuestions) as QuestionKey[],
  qwen: Object.keys(enQuestions) as QuestionKey[],
};

function assignQuestions(models: readonly string[], questions: string[]) {
  return Object.fromEntries(models.map((modelId) => [modelId, questions]));
}

function questionsForLocale(locale: string, keys: QuestionKey[]) {
  const localizedQuestions = QUESTION_SETS_BY_LANGUAGE[locale] ?? jaQuestions;
  return keys.map((key) => localizedQuestions[key]);
}

function buildLanguageCatalog(locale: string): ExampleQuestions {
  return {
    ...assignQuestions(
      MODEL_GROUPS.eques,
      questionsForLocale(locale, QUESTION_ORDER_BY_GROUP.eques),
    ),
    ...assignQuestions(
      MODEL_GROUPS.qwen,
      questionsForLocale(locale, QUESTION_ORDER_BY_GROUP.qwen),
    ),
  };
}

export const exampleQuestionsByLanguage: Record<string, ExampleQuestions> = {
  en: buildLanguageCatalog("en"),
  ja: buildLanguageCatalog("ja"),
};
