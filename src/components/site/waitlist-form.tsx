import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { submitWaitlist } from "@/lib/waitlist.functions";
import {
  DISPOSABLE_EMAIL_MESSAGE,
  PAIN_POINT_MAX,
  waitlistRoles,
  waitlistSchema,
} from "@/lib/waitlist-schema";

type FieldErrors = Partial<Record<"email" | "role" | "painPoint" | "consent", string>>;
type Outcome = { kind: "ok" } | { kind: "duplicate" } | { kind: "error" };

export function WaitlistForm() {
  const submit = useServerFn(submitWaitlist);

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
        setErrors({ email: DISPOSABLE_EMAIL_MESSAGE });
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
          Terkirim
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {outcome.kind === "ok"
            ? "Terima kasih. Email kamu sudah masuk daftar pilot."
            : "Email ini sudah terdaftar. Tidak ada data baru yang ditambahkan."}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Belum ada email otomatis pada tahap ini. Kabar pilot akan dikirim manual saat pendaftaran
          dibuka.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 max-w-xl space-y-6">
      <div>
        <Label htmlFor="wl-email">Email</Label>
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
        <legend className="text-sm font-medium text-foreground">Peran</legend>
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
        <Label htmlFor="wl-pain">Masalah utama saat membangun dengan AI (opsional)</Label>
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
            Saya setuju BuildLoop menggunakan data ini untuk menghubungi saya terkait pilot.
          </Label>
        </div>
        {errors.consent ? (
          <p id="wl-consent-error" role="alert" className="mt-2 text-xs text-destructive">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {/* Honeypot: tidak fokusabel dan tidak diumumkan screen reader. */}
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
          {loading ? "Mengirim…" : "Gabung Pilot"}
        </button>
        <p className="text-xs text-muted-foreground">
          Hanya email, peran, dan persetujuan yang disimpan.
        </p>
      </div>

      {outcome?.kind === "error" ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="alert"
          className="border border-border bg-card p-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Pengiriman gagal. Coba lagi sebentar lagi.
        </div>
      ) : null}
    </form>
  );
}
