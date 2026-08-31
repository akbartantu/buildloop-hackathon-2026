import type { DeliveryHandoff } from "@/lib/delivery-artifact";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import { DEFAULT_LOCALE, translate, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n/en";

export type DeliveryHandoffViewModel = {
  title: string;
  intro: string;
  patchFilename: string;
  patchAvailable: boolean;
  blockedReason: string | null;
  changedFiles: string[];
  binaryFiles: string[];
  suggestedCommitMessage: string;
  suggestedCommitDescription: string;
  verifiedAgainstSha: string;
  sourceDriftWarning: string | null;
  applyCommands: string;
  pushCommand: string;
  pushNote: string;
  remoteActions: Array<{ label: string; value: string }>;
};

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function t(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const translated = translate(locale, key, params);
  return translated === key ? key : translated;
}

export function buildGitApplyCommands(input: {
  patchFilename: string;
  targetBranch: string;
  changedFiles: string[];
  commitMessage: string;
  commitDescription: string;
}): { applyCommands: string; pushCommand: string } {
  const branch = input.targetBranch.trim() || "<target-branch>";
  const branchArg = branch.startsWith("<") && branch.endsWith(">") ? branch : shellQuote(branch);
  const addLines =
    input.changedFiles.length > 0
      ? input.changedFiles.map((file) => `git add ${shellQuote(file)}`).join("\n")
      : "git add <verified-files>";

  const applyCommands = [
    `git checkout ${branchArg}`,
    "git pull",
    `git apply ${shellQuote(input.patchFilename)}`,
    "git diff",
    addLines,
    `git commit -m ${shellQuote(input.commitMessage)} -m ${shellQuote(input.commitDescription)}`,
  ].join("\n");

  return {
    applyCommands,
    pushCommand: `git push origin ${branchArg}`,
  };
}

export function buildDeliveryHandoffViewModel(input: {
  handoff: DeliveryHandoff;
  targetBranch: string;
  sourceCommitSha: string | null;
  sourceCommitDrift: boolean;
  locale?: Locale;
}): DeliveryHandoffViewModel {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const handoff = input.handoff;
  const textChangedFiles = handoff.files
    .filter((file) => file.changeType !== "binary")
    .map((file) => file.path);
  const binaryFiles = handoff.files
    .filter((file) => file.changeType === "binary")
    .map((file) => file.path);
  const commands = buildGitApplyCommands({
    patchFilename: handoff.patchFilename,
    targetBranch: input.targetBranch,
    changedFiles: textChangedFiles,
    commitMessage: handoff.suggestedCommitMessage,
    commitDescription: handoff.suggestedCommitDescription,
  });

  return {
    title: t(locale, "delivery.handoff.title"),
    intro: t(locale, "delivery.handoff.intro"),
    patchFilename: handoff.patchFilename,
    patchAvailable: Boolean(handoff.patch && !handoff.blocked),
    blockedReason: handoff.blocked ? handoff.blockedReason ?? t(locale, "delivery.handoff.blockedDefault") : null,
    changedFiles: handoff.changedFiles,
    binaryFiles,
    suggestedCommitMessage: handoff.suggestedCommitMessage,
    suggestedCommitDescription: handoff.suggestedCommitDescription,
    verifiedAgainstSha: abbreviateCommitSha(handoff.baselineSha),
    sourceDriftWarning: input.sourceCommitDrift
      ? t(locale, "delivery.handoff.sourceDriftWarning")
      : null,
    applyCommands: commands.applyCommands,
    pushCommand: commands.pushCommand,
    pushNote: t(locale, "delivery.handoff.pushNote"),
    remoteActions: [
      { label: "Git commit", value: t(locale, "delivery.handoff.remote.commit") },
      { label: "Push", value: t(locale, "delivery.handoff.remote.push") },
      { label: "Merge", value: t(locale, "delivery.handoff.remote.merge") },
      { label: "Deploy", value: t(locale, "delivery.handoff.remote.deploy") },
    ],
  };
}

export function canShowDeliveryHandoff(input: {
  commitApproved: boolean;
  handoff?: DeliveryHandoff | null;
}): boolean {
  return input.commitApproved && Boolean(input.handoff);
}
