import type { TaskRecord } from "@/lib/tasks-schema";
import type { TaskLifecycleViewModel } from "@/lib/task-lifecycle";
import { canRecordHumanApproval } from "@/lib/human-approval";

export type TaskLifecycleCore = Omit<TaskLifecycleViewModel, "approval">;

export type ApprovalRecommendationKind =
  | "RECOMMENDED_APPROVE"
  | "FIX_FIRST"
  | "HUMAN_REVIEW_REQUIRED";

export type CorrectionTimelineEntry = {
  phase: string;
  detail: string;
};

export type HistoricalCorrectionView = {
  issueCount: number;
  summary: string;
  timeline: CorrectionTimelineEntry[];
};

export type ApprovalRecommendationView = {
  kind: ApprovalRecommendationKind;
  label: string;
  description: string;
  reasonBullets: string[];
  unresolvedIssues: string[];
  historicalCorrection: HistoricalCorrectionView | null;
  finalChecksSummary: string;
  overviewSummary: string;
  canRecommendApprove: boolean;
  commitAutomationNote: string | null;
};

type EvidenceItem = NonNullable<TaskRecord["runnerState"]>["evidence"] extends infer E
  ? E extends Array<infer I>
    ? I
    : never
  : never;

const SENSITIVE_CATEGORIES = new Set(["protected_path", "credential", "dependency"]);

function evidenceItems(task: TaskRecord): EvidenceItem[] {
  return (task.runnerState?.evidence ?? []) as EvidenceItem[];
}

function finalFailedOrBlocked(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter((item) => item.status === "fail" || item.status === "blocked");
}

function hasSensitiveUnresolved(items: EvidenceItem[]): boolean {
  return finalFailedOrBlocked(items).some((item) => SENSITIVE_CATEGORIES.has(item.category));
}

function plainLanguageIssue(item: EvidenceItem): string {
  if (item.summary && !item.summary.match(/^[a-z_]+:/i)) {
    return item.summary.endsWith(".") ? item.summary : `${item.summary}.`;
  }
  switch (item.category) {
    case "acceptance":
      return "Satu atau lebih acceptance criteria belum terpenuhi.";
    case "protected_path":
      return "Perubahan menyentuh area terlindungi yang tidak diizinkan.";
    case "credential":
      return "Pola credential atau secret terdeteksi pada file yang diubah.";
    case "dependency":
      return "Dependency baru terdeteksi dan membutuhkan tinjauan.";
    case "scope":
      return "Perubahan di luar scope yang disetujui.";
    default:
      return item.summary || "Satu pemeriksaan wajib belum lolos.";
  }
}

function buildReasonBullets(task: TaskRecord, lifecycle: TaskLifecycleCore): string[] {
  const bullets: string[] = [];
  const items = evidenceItems(task);

  if (lifecycle.checks.allRequiredSatisfied && lifecycle.checks.total > 0) {
    bullets.push("Semua pemeriksaan akhir lolos.");
  }

  if (lifecycle.implementationVerdict === "PASS") {
    bullets.push("Checker independen memverifikasi hasil akhir.");
  }

  if (items.some((item) => item.category === "scope" && item.status === "pass")) {
    bullets.push("Perubahan sesuai scope task.");
  } else if (lifecycle.hasRun && lifecycle.isPassLike && items.length === 0) {
    // No scope evidence row — omit rather than claim.
  } else if (lifecycle.isPassLike && task.runnerState?.filesChanged !== undefined) {
    bullets.push("Perubahan sesuai scope task.");
  }

  const protectedPass = items.find(
    (item) => item.category === "protected_path" && item.status === "pass",
  );
  if (protectedPass) {
    bullets.push("Tidak ada area terlindungi yang diubah.");
  }

  const dependencyPass = items.find(
    (item) => item.category === "dependency" && item.status === "pass",
  );
  if (dependencyPass) {
    bullets.push("Tidak ada dependency baru.");
  } else if (
    lifecycle.isPassLike &&
    !items.some((item) => item.category === "dependency")
  ) {
    // Omit if no dependency check ran.
  }

  const credentialPass = items.every(
    (item) => item.category !== "credential" || item.status === "pass",
  );
  const hasCredentialCheck = items.some((item) => item.category === "credential");
  if (hasCredentialCheck && credentialPass) {
    bullets.push("Tidak ada credential atau secret yang disentuh.");
  }

  return bullets;
}

function buildHistoricalCorrection(
  task: TaskRecord,
  lifecycle: TaskLifecycleCore,
): HistoricalCorrectionView | null {
  const corrections = lifecycle.correctionsUsed;
  if (corrections <= 0) {
    return null;
  }

  const log = task.runnerState?.decisionLog ?? [];
  const correctionEntries = log.filter((entry) => entry.rule === "CORRECTION_ALLOWED");
  const timeline: CorrectionTimelineEntry[] = [];

  correctionEntries.forEach((entry, index) => {
    timeline.push({
      phase: `Attempt ${index + 1}`,
      detail: entry.summary || "Pemeriksaan belum lolos.",
    });
    timeline.push({
      phase: "Correction",
      detail: "BuildLoop memperbaiki masalah dalam scope yang disetujui.",
    });
  });

  if (correctionEntries.length === 0 && corrections > 0) {
    timeline.push({
      phase: "Correction",
      detail: "BuildLoop menemukan masalah dan memperbaikinya otomatis.",
    });
  }

  if (lifecycle.checks.allRequiredSatisfied && lifecycle.implementationVerdict === "PASS") {
    timeline.push({
      phase: "Final check",
      detail: "Semua required checks lolos.",
    });
  }

  const issueWord = corrections === 1 ? "masalah" : "masalah";
  const verified =
    lifecycle.checks.allRequiredSatisfied && lifecycle.implementationVerdict === "PASS";
  return {
    issueCount: corrections,
    summary: verified
      ? `${corrections} ${issueWord} ditemukan sebelumnya dan berhasil diperbaiki otomatis.`
      : `${corrections} ${issueWord} ditemukan selama proses (lihat riwayat teknis).`,
    timeline,
  };
}

function buildFinalChecksSummary(lifecycle: TaskLifecycleCore): string {
  if (lifecycle.checks.total === 0) {
    return "Belum ada pemeriksaan akhir.";
  }
  if (lifecycle.checks.allRequiredSatisfied) {
    return "Semua pemeriksaan akhir lolos.";
  }
  return lifecycle.checks.friendlySummary;
}

function buildOverviewSummary(
  kind: ApprovalRecommendationKind,
  lifecycle: TaskLifecycleCore,
  task: TaskRecord,
): string {
  if (task.runnerState?.commitApproved) {
    if (lifecycle.delivery.commit === "EXECUTED") {
      return "Commit disetujui dan dijalankan.";
    }
    return "Commit disetujui, belum dijalankan.";
  }

  switch (kind) {
    case "RECOMMENDED_APPROVE":
      return "BuildLoop recommendation: Approve commit";
    case "FIX_FIRST":
      return "Belum disarankan untuk di-approve";
    case "HUMAN_REVIEW_REQUIRED":
      return "Perlu review manusia";
  }
}

/** Pure presentation layer — does not override checker or decision engine authority. */
export function deriveApprovalRecommendation(
  task: TaskRecord,
  lifecycle: TaskLifecycleCore,
): ApprovalRecommendationView {
  const runner = task.runnerState;
  const items = evidenceItems(task);
  const unresolvedFromEvidence = finalFailedOrBlocked(items).map(plainLanguageIssue);
  const historicalCorrection = buildHistoricalCorrection(task, lifecycle);
  const finalChecksSummary = buildFinalChecksSummary(lifecycle);

  const commitAutomationNote =
    lifecycle.delivery.commit === "APPROVED" && !runner?.commit
      ? "BuildLoop akan mencatat izin commit. Eksekusi Git commit otomatis belum tersedia pada versi ini."
      : null;

  if (runner?.commitApproved) {
    return {
      kind: "RECOMMENDED_APPROVE",
      label: "Commit telah disetujui",
      description: "Anda telah memberikan izin untuk commit pada task ini.",
      reasonBullets: buildReasonBullets(task, lifecycle),
      unresolvedIssues: [],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("RECOMMENDED_APPROVE", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote,
    };
  }

  if (task.status === "BLOCKED" || runner?.escalated) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: "Perlu review manusia",
      description:
        task.status === "BLOCKED"
          ? task.blockedReasons[0]?.explanation ??
            "BuildLoop tidak merekomendasikan keputusan otomatis untuk kondisi ini."
          : "BuildLoop tidak memiliki cukup bukti untuk merekomendasikan approval secara otomatis.",
      reasonBullets: [],
      unresolvedIssues:
        task.blockedReasons.length > 0
          ? task.blockedReasons.map((reason) => reason.explanation)
          : unresolvedFromEvidence,
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (task.status === "FAILED") {
    return {
      kind: "FIX_FIRST",
      label: "Belum disarankan untuk di-approve",
      description:
        "BuildLoop menemukan masalah yang masih belum terselesaikan setelah batas koreksi.",
      reasonBullets: [],
      unresolvedIssues:
        unresolvedFromEvidence.length > 0
          ? unresolvedFromEvidence.slice(0, 3)
          : ["Checker gagal setelah batas koreksi otomatis."],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("FIX_FIRST", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (!runner?.runnerInvoked || lifecycle.checks.total === 0) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: "Perlu review manusia",
      description:
        "BuildLoop tidak memiliki cukup bukti untuk merekomendasikan approval secara otomatis.",
      reasonBullets: [],
      unresolvedIssues: ["Evidence pemeriksaan akhir belum tersedia."],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (!lifecycle.checks.allRequiredSatisfied) {
    return {
      kind: "FIX_FIRST",
      label: "Belum disarankan untuk di-approve",
      description:
        "Masih ada pemeriksaan yang belum terpenuhi. Selesaikan masalah berikut sebelum memberikan approval.",
      reasonBullets: [],
      unresolvedIssues:
        unresolvedFromEvidence.length > 0
          ? unresolvedFromEvidence.slice(0, 3)
          : [lifecycle.checks.friendlySummary],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("FIX_FIRST", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (lifecycle.implementationVerdict !== "PASS") {
    const kind: ApprovalRecommendationKind = hasSensitiveUnresolved(items)
      ? "HUMAN_REVIEW_REQUIRED"
      : "FIX_FIRST";
    return {
      kind,
      label: kind === "HUMAN_REVIEW_REQUIRED" ? "Perlu review manusia" : "Belum disarankan untuk di-approve",
      description:
        kind === "HUMAN_REVIEW_REQUIRED"
          ? "BuildLoop tidak memiliki cukup bukti untuk merekomendasikan approval secara otomatis."
          : "BuildLoop menemukan masalah yang masih belum terselesaikan.",
      reasonBullets: [],
      unresolvedIssues:
        unresolvedFromEvidence.length > 0
          ? unresolvedFromEvidence.slice(0, 3)
          : ["Verdict implementasi belum PASS menurut checker."],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary(kind, lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (hasSensitiveUnresolved(items)) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: "Perlu review manusia",
      description:
        "Perubahan menyentuh area sensitif atau checker tidak dapat memastikan compliance secara otomatis.",
      reasonBullets: [],
      unresolvedIssues: unresolvedFromEvidence.slice(0, 3),
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  if (!canRecordHumanApproval(task.status)) {
    return {
      kind: "HUMAN_REVIEW_REQUIRED",
      label: "Perlu review manusia",
      description: "Approval belum sesuai lifecycle task saat ini.",
      reasonBullets: buildReasonBullets(task, lifecycle),
      unresolvedIssues: [],
      historicalCorrection,
      finalChecksSummary,
      overviewSummary: buildOverviewSummary("HUMAN_REVIEW_REQUIRED", lifecycle, task),
      canRecommendApprove: false,
      commitAutomationNote: null,
    };
  }

  return {
    kind: "RECOMMENDED_APPROVE",
    label: "BuildLoop merekomendasikan approval",
    description:
      "Task sudah selesai sesuai kontrak dan tidak ada masalah sensitif yang belum terselesaikan. Berdasarkan contract dan pemeriksaan yang dijalankan, BuildLoop merekomendasikan approval.",
    reasonBullets: buildReasonBullets(task, lifecycle),
    unresolvedIssues: [],
    historicalCorrection,
    finalChecksSummary,
    overviewSummary: buildOverviewSummary("RECOMMENDED_APPROVE", lifecycle, task),
    canRecommendApprove: true,
    commitAutomationNote: null,
  };
}

/** Tab navigation: hide step icon when completion check already shown. */
export function shouldRenderTabIcon(tabProgress: "complete" | "current" | "upcoming"): boolean {
  return tabProgress !== "complete";
}
