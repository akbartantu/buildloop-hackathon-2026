import type { Locale } from "@/i18n";
import { translate, type TranslationKey } from "@/i18n";

/** Whitelisted runtime diagnostics persisted on tasks and shown in Evidence UI. */
export type WorkerRuntimeDiagnostics = {
  provider: "Gemini";
  model?: string;
  finishReason?: string;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  maxOutputTokens?: number;
  rawResponseLength?: number;
  stage?: string;
  errorCode?: string;
  attempt?: number;
};

export type RuntimeDiagnosticSource = {
  finishReason?: string | null;
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  totalTokenCount?: number | null;
  maxOutputTokens?: number | null;
  rawResponseLength?: number | null;
};

export type RuntimeDiagnosticRow = {
  key: keyof WorkerRuntimeDiagnostics | "provider";
  label: string;
  value: string;
};

const RUNTIME_DIAGNOSTIC_ROW_ORDER: Array<keyof WorkerRuntimeDiagnostics | "provider"> = [
  "provider",
  "model",
  "finishReason",
  "attempt",
  "stage",
  "errorCode",
  "promptTokenCount",
  "thoughtsTokenCount",
  "candidatesTokenCount",
  "totalTokenCount",
  "maxOutputTokens",
  "rawResponseLength",
];

function readOptionalCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasMeaningfulRuntimeDiagnostics(diagnostics: WorkerRuntimeDiagnostics): boolean {
  return RUNTIME_DIAGNOSTIC_ROW_ORDER.some((key) => {
    if (key === "provider") {
      return diagnostics.provider === "Gemini";
    }
    return diagnostics[key] !== undefined;
  });
}

/** Build whitelisted diagnostics from safe ADK/Gemini metadata. */
export function buildWorkerRuntimeDiagnostics(input: {
  model?: string;
  responseDiagnostics?: RuntimeDiagnosticSource;
  stage?: string;
  errorCode?: string;
  attemptNumber?: number;
}): WorkerRuntimeDiagnostics | undefined {
  const source = input.responseDiagnostics;
  const diagnostics: WorkerRuntimeDiagnostics = { provider: "Gemini" };

  const model = readOptionalString(input.model);
  if (model) {
    diagnostics.model = model;
  }
  const finishReason = readOptionalString(source?.finishReason);
  if (finishReason) {
    diagnostics.finishReason = finishReason;
  }
  const promptTokenCount = readOptionalCount(source?.promptTokenCount);
  if (promptTokenCount !== undefined) {
    diagnostics.promptTokenCount = promptTokenCount;
  }
  const candidatesTokenCount = readOptionalCount(source?.candidatesTokenCount);
  if (candidatesTokenCount !== undefined) {
    diagnostics.candidatesTokenCount = candidatesTokenCount;
  }
  const thoughtsTokenCount = readOptionalCount(source?.thoughtsTokenCount);
  if (thoughtsTokenCount !== undefined) {
    diagnostics.thoughtsTokenCount = thoughtsTokenCount;
  }
  const totalTokenCount = readOptionalCount(source?.totalTokenCount);
  if (totalTokenCount !== undefined) {
    diagnostics.totalTokenCount = totalTokenCount;
  }
  const maxOutputTokens = readOptionalCount(source?.maxOutputTokens);
  if (maxOutputTokens !== undefined) {
    diagnostics.maxOutputTokens = maxOutputTokens;
  }
  const rawResponseLength = readOptionalCount(source?.rawResponseLength);
  if (rawResponseLength !== undefined) {
    diagnostics.rawResponseLength = rawResponseLength;
  }
  const stage = readOptionalString(input.stage);
  if (stage) {
    diagnostics.stage = stage;
  }
  const errorCode = readOptionalString(input.errorCode);
  if (errorCode) {
    diagnostics.errorCode = errorCode;
  }
  const attempt = readOptionalCount(input.attemptNumber);
  if (attempt !== undefined) {
    diagnostics.attempt = attempt;
  }

  return hasMeaningfulRuntimeDiagnostics(diagnostics) ? diagnostics : undefined;
}

export function extractLatestWorkerRuntimeDiagnostics(
  workerReports: Array<{ runtimeDiagnostics?: WorkerRuntimeDiagnostics }> | undefined,
): WorkerRuntimeDiagnostics | undefined {
  if (!workerReports?.length) {
    return undefined;
  }
  for (let index = workerReports.length - 1; index >= 0; index -= 1) {
    const diagnostics = workerReports[index]?.runtimeDiagnostics;
    if (diagnostics) {
      return diagnostics;
    }
  }
  return undefined;
}

function formatCount(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "id" ? "id-ID" : "en-US");
}

function runtimeLabel(locale: Locale, key: TranslationKey): string {
  const translated = translate(locale, key);
  return translated === key ? key : translated;
}

function formatRuntimeValue(
  key: keyof WorkerRuntimeDiagnostics | "provider",
  diagnostics: WorkerRuntimeDiagnostics,
  locale: Locale,
): string | undefined {
  if (key === "provider") {
    return diagnostics.provider;
  }
  const value = diagnostics[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return formatCount(value, locale);
  }
  return String(value);
}

/** Render only explicitly approved diagnostic fields. */
export function buildRuntimeDiagnosticRows(
  diagnostics: WorkerRuntimeDiagnostics,
  locale: Locale,
): RuntimeDiagnosticRow[] {
  const rows: RuntimeDiagnosticRow[] = [];
  for (const key of RUNTIME_DIAGNOSTIC_ROW_ORDER) {
    const value = formatRuntimeValue(key, diagnostics, locale);
    if (!value) {
      continue;
    }
    rows.push({
      key,
      label: runtimeLabel(locale, `runtimeDiagnostics.fields.${key}` as TranslationKey),
      value,
    });
  }
  return rows;
}

export function isMaxTokensRuntimeFailure(diagnostics: WorkerRuntimeDiagnostics | undefined): boolean {
  return diagnostics?.finishReason === "MAX_TOKENS";
}

/** Plain-language explanation for operational provider failures. */
export function buildRuntimeOperationalExplanation(
  diagnostics: WorkerRuntimeDiagnostics | undefined,
  locale: Locale,
): string | null {
  if (!diagnostics) {
    return null;
  }
  if (isMaxTokensRuntimeFailure(diagnostics)) {
    return translate(locale, "runtimeDiagnostics.explanation.maxTokens");
  }
  if (diagnostics.errorCode === "GEMINI_MALFORMED" && diagnostics.stage === "parse_output") {
    return translate(locale, "runtimeDiagnostics.explanation.malformedOutput");
  }
  if (diagnostics.errorCode === "GEMINI_QUOTA_EXHAUSTED") {
    return translate(locale, "runtimeDiagnostics.explanation.quotaExhausted");
  }
  if (diagnostics.errorCode === "ADK_EMPTY_RESPONSE") {
    return translate(locale, "runtimeDiagnostics.explanation.emptyResponse");
  }
  return null;
}

/** Reject unknown persisted keys before UI rendering. */
export function sanitizePersistedRuntimeDiagnostics(
  value: unknown,
): WorkerRuntimeDiagnostics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const buildInput: {
    model?: string;
    responseDiagnostics?: RuntimeDiagnosticSource;
    stage?: string;
    errorCode?: string;
    attemptNumber?: number;
  } = {};

  const model = readOptionalString(record["model"]);
  if (model) {
    buildInput.model = model;
  }

  const responseDiagnostics: RuntimeDiagnosticSource = {};
  let hasResponseDiagnostics = false;
  const finishReason = readOptionalString(record["finishReason"]);
  if (finishReason) {
    responseDiagnostics.finishReason = finishReason;
    hasResponseDiagnostics = true;
  }
  for (const [field, key] of [
    ["promptTokenCount", "promptTokenCount"],
    ["candidatesTokenCount", "candidatesTokenCount"],
    ["thoughtsTokenCount", "thoughtsTokenCount"],
    ["totalTokenCount", "totalTokenCount"],
    ["maxOutputTokens", "maxOutputTokens"],
    ["rawResponseLength", "rawResponseLength"],
  ] as const) {
    const count = readOptionalCount(record[key]);
    if (count !== undefined) {
      responseDiagnostics[field] = count;
      hasResponseDiagnostics = true;
    }
  }
  if (hasResponseDiagnostics) {
    buildInput.responseDiagnostics = responseDiagnostics;
  }

  const stage = readOptionalString(record["stage"]);
  if (stage) {
    buildInput.stage = stage;
  }
  const errorCode = readOptionalString(record["errorCode"]);
  if (errorCode) {
    buildInput.errorCode = errorCode;
  }
  const attempt = readOptionalCount(record["attempt"]);
  if (attempt !== undefined) {
    buildInput.attemptNumber = attempt;
  }

  const built = buildWorkerRuntimeDiagnostics(buildInput);
  return built?.provider === "Gemini" ? built : undefined;
}

/** Ensure serialized diagnostics cannot carry prompt/response/secrets. */
export function assertRuntimeDiagnosticsSafeForDisplay(
  diagnostics: WorkerRuntimeDiagnostics,
): void {
  const serialized = JSON.stringify(diagnostics).toLowerCase();
  const forbidden = [
    "api_key",
    "authorization",
    "cookie",
    "secret",
    "password",
    "prompt",
    "systeminstruction",
    "changedfiles",
    "content",
    "patch",
    "stack",
    "trace",
  ];
  for (const token of forbidden) {
    if (serialized.includes(token)) {
      throw new Error(`Unsafe runtime diagnostics field detected: ${token}`);
    }
  }
}
