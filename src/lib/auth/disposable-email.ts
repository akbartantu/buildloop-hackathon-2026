export const DISPOSABLE_EMAIL_MESSAGE =
  "Please use a permanent email address. Temporary or disposable email addresses are not supported.";

/** Trim whitespace and lowercase the full email address. */
export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Build domain suffix candidates for exact blocklist matching (e.g. mail.example.com → mail.example.com, example.com). */
export function extractDomainCandidates(domain: string): string[] {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(".")
    .map((_, index, parts) => parts.slice(index).join("."))
    .filter((candidate) => candidate.includes("."));
}

type BlocklistChecker = (email: string) => Promise<boolean>;

let blocklistCheckerOverride: BlocklistChecker | null = null;

/** Test hook — override the server-side blocklist lookup. */
export function setBlocklistCheckerForTests(checker: BlocklistChecker | null): void {
  blocklistCheckerOverride = checker;
}

async function queryBlocklistViaRpc(email: string): Promise<boolean | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rpc = supabaseAdmin.rpc as (
    fn: "is_email_domain_blocked",
    args: { _email: string },
  ) => PromiseLike<{ data: boolean | null; error: { code?: string } | null }>;

  const { data, error } = await rpc("is_email_domain_blocked", { _email: email });
  if (error) {
    return null;
  }
  return data === true;
}

async function queryBlocklistViaTable(email: string): Promise<boolean> {
  const normalized = normalizeAuthEmail(email);
  const domain = normalized.split("@")[1] ?? "";
  if (!domain) {
    return false;
  }

  const candidates = extractDomainCandidates(domain);
  if (candidates.length === 0) {
    return false;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: blocked, error } = await supabaseAdmin
    .from("blocked_email_domains")
    .select("domain")
    .in("domain", candidates)
    .limit(1);

  if (error) {
    console.error("disposable email domain check failed", error.code);
    throw new Error("domain_check_failed");
  }

  return Boolean(blocked && blocked.length > 0);
}

/** Returns true when the email domain is on the disposable/temporary blocklist. */
export async function isDisposableEmailDomain(email: string): Promise<boolean> {
  const normalized = normalizeAuthEmail(email);

  if (blocklistCheckerOverride) {
    return blocklistCheckerOverride(normalized);
  }

  const rpcResult = await queryBlocklistViaRpc(normalized);
  if (rpcResult !== null) {
    return rpcResult;
  }

  return queryBlocklistViaTable(normalized);
}
