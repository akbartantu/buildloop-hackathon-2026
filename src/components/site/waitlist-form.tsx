import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { submitWaitlist } from "@/lib/waitlist.functions";
import {
  createWaitlistSchema,
  PAIN_POINT_MAX,
  waitlistRoleValues,
  type WaitlistRoleValue,
} from "@/lib/waitlist-schema";
import { useI18n } from "@/i18n/context";
import { usePublicI18n } from "@/i18n/use-public-i18n";

type FieldErrors = Partial<Record<"email" | "role" | "painPoint" | "consent", string>>;
type Outcome = { kind: "ok" } | { kind: "duplicate" } | { kind: "error" };

export function WaitlistForm() {
  const submit = useServerFn(submitWaitlist);
  const { t } = useI18n();
  const { pt } = usePublicI18n();

  const waitlistSchema = useMemo(
    () =>
      createWaitlistSchema({
        emailRequired: pt("waitlist.errors.emailRequired"),
        emailMax: pt("waitlist.errors.emailMax"),
        emailInvalid: pt("waitlist.errors.emailInvalid"),
        roleRequired: pt("waitlist.errors.roleRequired"),
        painMax: pt("waitlist.errors.painMax", { max: PAIN_POINT_MAX }),
        consentRequired: pt("waitlist.errors.consentRequired"),
      }),
    [pt],
  );

  const waitlistRoles = useMemo(
    () =>
      waitlistRoleValues.map((value) => ({
        value,
        label: pt(`waitlist.roles.${value}` as `waitlist.roles.${WaitlistRoleValue}`),
      })),
    [pt],
  );

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outcome) resultRef.current?.focus();
  }, [outcome]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const parsed = waitlistSchema.safeParse({
      email,
      role,
      painPoint: painPoint.length > 0 ? painPoint : undefined,
      consent,
      trap,
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "role" || key === "painPoint" || key === "consent") {
          next[key] = next[key] ?? issue.message;
        }
      }
      setErrors(next);
      setOutcome(null);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const result = await submit({ data: parsed.data });
      if (result.status === "ok") setOutcome({ kind: "ok" });
      else if (result.status === "duplicate") setOutcome({ kind: "duplicate" });
      else if (result.status === "disposable_email") {
        setErrors({ email: pt("waitlist.errors.disposableEmail") });
        setOutcome(null);
      } else setOutcome({ kind: "error" });
    } catch {
      setOutcome({ kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  if (outcome && outcome.kind !== "error") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="mt-6 max-w-xl border border-border bg-card p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {pt("waitlist.sent")}
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {outcome.kind === "ok" ? pt("waitlist.success") : pt("waitlist.duplicate")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pt("waitlist.followUp")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 max-w-xl space-y-6">
      <div>
        <Label htmlFor="wl-email">{t("auth.email")}</Label>
        <Input
          id="wl-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "wl-email-error" : undefined}
          className="mt-2"
        />
        {errors.email ? (
          <p id="wl-email-error" role="alert" className="mt-2 text-xs text-destructive">
            {errors.email}
          </p>
        ) : null}
      </div>

      <fieldset
        aria-invalid={errors.role ? true : undefined}
        aria-describedby={errors.role ? "wl-role-error" : undefined}
      >
        <legend className="text-sm font-medium text-foreground">{pt("waitlist.role")}</legend>
        <RadioGroup value={role} onValueChange={setRole} className="mt-3 gap-3">
          {waitlistRoles.map((option) => (
            <div key={option.value} className="flex items-center gap-2.5">
              <RadioGroupItem id={`wl-role-${option.value}`} value={option.value} />
              <Label htmlFor={`wl-role-${option.value}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {errors.role ? (
          <p id="wl-role-error" role="alert" className="mt-2 text-xs text-destructive">
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      <div>
        <Label htmlFor="wl-pain">{pt("waitlist.painLabel")}</Label>
        <Textarea
          id="wl-pain"
          name="painPoint"
          rows={4}
          maxLength={PAIN_POINT_MAX}
          value={painPoint}
          onChange={(e) => setPainPoint(e.target.value)}
          aria-invalid={errors.painPoint ? true : undefined}
          aria-describedby={errors.painPoint ? "wl-pain-error wl-pain-count" : "wl-pain-count"}
          className="mt-2"
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          {errors.painPoint ? (
            <p id="wl-pain-error" role="alert" className="text-xs text-destructive">
              {errors.painPoint}
            </p>
          ) : (
            <span />
          )}
          <p id="wl-pain-count" className="font-mono text-[11px] text-muted-foreground">
            {painPoint.length}/{PAIN_POINT_MAX}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="wl-consent"
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "wl-consent-error" : undefined}
            className="mt-0.5"
          />
          <Label htmlFor="wl-consent" className="font-normal leading-relaxed">
            {pt("waitlist.consent")}
          </Label>
        </div>
        {errors.consent ? (
          <p id="wl-consent-error" role="alert" className="mt-2 text-xs text-destructive">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <div aria-hidden="true" className="hidden">
        <label htmlFor="wl-company-url">Company URL</label>
        <input
          id="wl-company-url"
          name="company_url"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {loading ? pt("waitlist.submitting") : pt("waitlist.submit")}
        </button>
        <p className="text-xs text-muted-foreground">{pt("waitlist.privacyNote")}</p>
      </div>

      {outcome?.kind === "error" ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="alert"
          className="border border-border bg-card p-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {pt("waitlist.submitError")}
        </div>
      ) : null}
    </form>
  );
}
