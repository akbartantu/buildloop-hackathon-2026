import { summarizeEvidence } from "./local-store";
import type { StoredRun } from "./local-store";

export const FIRESTORE_RUNS_COLLECTION = "buildloopRuns";
export const FIRESTORE_SCHEMA_VERSION = 1;

export type FirestoreRunRecord = {
  schemaVersion: number;
  taskId: string;
  runId: string;
  taskGoal: string;
  status: string;
  verdict: string | null;
  workerId: string;
  workerMode: string | null;
  correctionCount: number;
  workerCalls: number;
  checkerCalls: number;
  filesChanged: number;
  commandsExecuted: number;
  evidenceCount: number;
  storedAt: string;
  startedAt: string;
  completedAt: string | null;
  verdictReason: string | null;
  evidenceSummary: ReturnType<typeof summarizeEvidence>;
  orchestrationPayload: string;
};

export function storedRunToFirestoreRecord(run: StoredRun): FirestoreRunRecord {
  const counters = run.run.counters;
  const extended = run as StoredRun & {
    workerMode?: string;
    workerId?: string;
  };

  return {
    schemaVersion: FIRESTORE_SCHEMA_VERSION,
    taskId: run.run.taskId,
    runId: run.run.id,
    taskGoal: run.taskGoal,
    status: run.run.status,
    verdict: run.run.verdict,
    workerId: extended.workerId ?? run.run.workerId,
    workerMode: extended.workerMode ?? null,
    correctionCount: counters.correctionCount,
    workerCalls: counters.workerCalls,
    checkerCalls: counters.checkerCalls,
    filesChanged: counters.filesChanged,
    commandsExecuted: counters.commandsExecuted,
    evidenceCount: run.evidence.length,
    storedAt: run.storedAt,
    startedAt: run.run.startedAt,
    completedAt: run.run.completedAt,
    verdictReason: run.run.verdictReason,
    evidenceSummary: summarizeEvidence(run.evidence),
    orchestrationPayload: JSON.stringify(sanitizeStoredRunPayload(run)),
  };
}

export function firestoreRecordToStoredRun(record: FirestoreRunRecord): StoredRun {
  const parsed = JSON.parse(record.orchestrationPayload) as StoredRun;
  return parsed;
}

function sanitizeStoredRunPayload(run: StoredRun): StoredRun {
  const clone = structuredClone(run) as StoredRun & { workspace?: string };
  if ("workspace" in clone) {
    delete clone.workspace;
  }
  for (const item of clone.evidence) {
    if (item.details && CREDENTIAL_LIKE.test(item.details)) {
      item.details = "[redacted]";
    }
  }
  for (const report of clone.workerReports) {
    if (report.patchSummary && CREDENTIAL_LIKE.test(report.patchSummary)) {
      report.patchSummary = "[redacted]";
    }
  }
  return clone;
}

const CREDENTIAL_LIKE =
  /\b(api[_-]?key|secret|password|token|credential|private key|service account)\b/i;

export type FirestoreFieldValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values: FirestoreFieldValue[] } }
  | { mapValue: { fields: Record<string, FirestoreFieldValue> } };

export function encodeFirestoreFields(
  value: Record<string, unknown>,
): Record<string, FirestoreFieldValue> {
  const fields: Record<string, FirestoreFieldValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined) continue;
    fields[key] = encodeFirestoreValue(raw);
  }
  return fields;
}

export function decodeFirestoreFields(
  fields: Record<string, FirestoreFieldValue>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = decodeFirestoreValue(value);
  }
  return output;
}

function encodeFirestoreValue(value: unknown): FirestoreFieldValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: encodeFirestoreFields(value as Record<string, unknown>),
      },
    };
  }
  return { stringValue: String(value) };
}

function decodeFirestoreValue(value: FirestoreFieldValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item));
  }
  if ("mapValue" in value) {
    return decodeFirestoreFields(value.mapValue.fields ?? {});
  }
  return null;
}

export function firestoreRecordFromFields(
  fields: Record<string, FirestoreFieldValue>,
): FirestoreRunRecord {
  const decoded = decodeFirestoreFields(fields);
  return decoded as unknown as FirestoreRunRecord;
}
