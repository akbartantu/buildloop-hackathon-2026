/**
 * Pre-flight detector deterministik. Dijalankan di server (bukan hanya di UI).
 * Tidak ada model AI di sini: input yang sama selalu menghasilkan hasil yang sama.
 */

export type BlockedReason = {
  rule: string;
  matchedText: string;
  explanation: string;
  protectedTarget: string;
};

type Rule = {
  rule: string;
  pattern: RegExp;
  explanation: string;
  protectedTarget: string;
};

/** Penanda larangan: klausa yang mengandung ini dianggap batasan pengguna, bukan permintaan. */
const NEGATION_MARKERS = [
  "jangan",
  "janganlah",
  "tanpa",
  "tidak boleh",
  "tidak usah",
  "dilarang",
  "hindari",
  "kecuali",
  "do not",
  "don't",
  "dont",
  "never",
  "avoid",
  "without",
];

const RULES: Rule[] = [
  {
    rule: "PROTECTED_PATH_ENV",
    pattern: /\.env\b|\.env[.a-z0-9_-]*|\bfile env\b/,
    explanation: "Task meminta perubahan pada file environment yang berisi konfigurasi rahasia.",
    protectedTarget: ".env*",
  },
  {
    rule: "PROTECTED_PATH_WORKFLOWS",
    pattern: /\.github\/workflows|github\s+workflows?|github\s+actions/,
    explanation: "Task meminta perubahan pada workflow CI/CD yang dapat memicu deployment.",
    protectedTarget: ".github/workflows/**",
  },
  {
    rule: "PROTECTED_PATH_INFRASTRUCTURE",
    pattern: /\binfrastructure\/|\binfrastruktur\b/,
    explanation: "Task meminta perubahan pada definisi infrastruktur.",
    protectedTarget: "infrastructure/**",
  },
  {
    rule: "PROTECTED_PATH_MIGRATIONS",
    pattern: /supabase\/migrations|\bmigration\b|\bmigrasi database\b/,
    explanation: "Task meminta perubahan skema database melalui migration.",
    protectedTarget: "supabase/migrations/**",
  },
  {
    rule: "PROTECTED_PATH_SUPABASE_INTEGRATION",
    pattern: /src\/integrations\/supabase/,
    explanation: "Task meminta perubahan pada modul integrasi backend yang dikelola otomatis.",
    protectedTarget: "src/integrations/supabase/**",
  },
  {
    rule: "CREDENTIAL_HANDLING",
    pattern:
      /\bcredential\w*\b|\bkredensial\b|\bsecret\w*\b|\btoken\b|\bapi[ -]?key\b|\bservice account\b|\bpassword\b|\bprivate key\b/,
    explanation: "Task meminta penanganan credential atau secret. Ini di luar allowed actions.",
    protectedTarget: "credential / secret",
  },
  {
    rule: "MAIN_BRANCH_WRITE",
    pattern: /\bbranch\s+main\b|\bmain\s+branch\b|\bke\s+main\b|\b(commit|push)\b[^|]*\bmain\b/,
    explanation: "Task menyasar branch utama. Perubahan pada main memerlukan approval manusia.",
    protectedTarget: "branch main",
  },
  {
    rule: "GIT_WRITE_ACTION",
    pattern: /\bcommit\b|\bpush\b|\bmerge\b|\bpull request\b|\brebase\b|\bforce[- ]push\b/,
    explanation: "Commit, push, dan merge adalah tindakan yang hanya boleh dilakukan manusia.",
    protectedTarget: "git write (commit/push/merge)",
  },
  {
    rule: "PRODUCTION_DEPLOYMENT",
    pattern: /\bdeploy\w*\b|\bproduction\b|\bproduksi\b|\bgo[- ]live\b|\brilis ke prod\w*\b/,
    explanation: "Task meminta deployment. Deployment tidak pernah dijalankan tanpa approval.",
    protectedTarget: "deployment",
  },
  {
    rule: "IRREVERSIBLE_ACTION",
    pattern:
      /\bdrop table\b|\btruncate\b|\bhapus database\b|\bdelete database\b|\breset --hard\b|\brotate\s+(key|secret)\b|\brevoke\b/,
    explanation: "Task meminta tindakan irreversible di luar allowed actions.",
    protectedTarget: "irreversible action",
  },
];

const SENTENCE_SPLIT = /[.;!?\n]+/;
const CLAUSE_SPLIT = /,|\bdan\b|\bserta\b|\blalu\b|\bkemudian\b|\batau\b|\band\b|\bthen\b|\bor\b/;

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasNegationMarker(clause: string): boolean {
  return NEGATION_MARKERS.some((marker) => clause.includes(marker));
}

/**
 * Klausa yang diminta pengguna, setelah membuang klausa larangan.
 * Penanda larangan berlaku sampai akhir kalimatnya, sehingga
 * "jangan mengubah autentikasi, dependency, atau deployment" tidak memicu rule.
 */
export function extractRequestedClauses(goal: string): string[] {
  const requested: string[] = [];

  for (const sentence of normalize(goal).split(SENTENCE_SPLIT)) {
    if (sentence.trim().length === 0) continue;
    let negated = false;

    for (const rawClause of sentence.split(CLAUSE_SPLIT)) {
      const clause = rawClause.trim();
      if (clause.length === 0) continue;
      if (hasNegationMarker(clause)) {
        negated = true;
        continue;
      }
      if (negated) continue;
      requested.push(clause);
    }
  }

  return requested;
}

/** Menghasilkan blocked reasons terstruktur; array kosong berarti task aman. */
export function detectSensitiveIntent(goal: string): BlockedReason[] {
  const clauses = extractRequestedClauses(goal);
  const reasons: BlockedReason[] = [];
  const seen = new Set<string>();

  for (const clause of clauses) {
    for (const rule of RULES) {
      const match = rule.pattern.exec(clause);
      if (!match) continue;
      if (seen.has(rule.rule)) continue;
      seen.add(rule.rule);
      reasons.push({
        rule: rule.rule,
        matchedText: match[0],
        explanation: rule.explanation,
        protectedTarget: rule.protectedTarget,
      });
    }
  }

  return reasons;
}
