import type { WorkerReport } from "./types";

/** Unique files touched in the final worker attempt (authoritative implementation diff). */
export function countUniqueChangedFiles(workerReports: WorkerReport[]): number {
  if (workerReports.length === 0) {
    return 0;
  }
  const finalReport = workerReports[workerReports.length - 1];
  return new Set(finalReport?.filesChanged ?? []).size;
}

/** Total file entries across all attempts (includes correction retries). */
export function countAttemptFileEntries(workerReports: WorkerReport[]): number {
  return workerReports.flatMap((report) => report.filesChanged).length;
}
