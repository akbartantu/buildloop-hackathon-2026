import { useEffect, useState } from "react";
import { AuthFieldError } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { changePasswordSchema } from "@/lib/auth/auth-schema";
import {
  canChangePassword,
  formatLastSignIn,
  isValidPhone,
  normalizeFullName,
  normalizePhone,
  resolveAuthProviderLabel,
} from "@/lib/auth/user-display";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { WORKSPACE_NAME } from "@/lib/task-contract";

type UserMetadata = {
  full_name?: string;
  phone?: string;
};

type PasswordFieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

function ProfileFormPanel() {
  const user = useSession();
  const devBypass = isDevAuthBypassEnabled();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const metadata = user?.user_metadata as UserMetadata | undefined;
    setFullName(metadata?.full_name ?? "");
    setPhone(metadata?.phone ?? "");
  }, [user]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || devBypass) {
      return;
    }

    const normalizedName = normalizeFullName(fullName);
    if (!normalizedName) {
      setError("Full name is required.");
      setSuccess(null);
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    if (!isValidPhone(normalizedPhone)) {
      setError("Enter a valid phone number or leave the field empty.");
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedName,
          phone: normalizedPhone,
        },
      });

      if (updateError) {
        setError("Could not save your profile. Please try again.");
        return;
      }

      setFullName(normalizedName);
      setPhone(normalizedPhone);
      setSuccess("Profile updated.");
    } catch {
      setError("Could not save your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const email = user?.email ?? "—";

  return (
    <DemoPanel title="Profile">
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <Label htmlFor="settings-full-name">Full name</Label>
          <Input
            id="settings-full-name"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={devBypass || loading}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="settings-phone">Phone</Label>
          <Input
            id="settings-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+62 812 3456 7890"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={devBypass || loading}
            className="mt-2"
          />
          <p className="mt-1 text-xs text-muted-foreground">Optional contact number for your profile.</p>
        </div>

        <div>
          <Label htmlFor="settings-email">Email</Label>
          <Input
            id="settings-email"
            name="email"
            value={email}
            readOnly
            disabled
            className="mt-2"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Email is managed by your authentication account.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-status-pass">{success}</p> : null}

        <Button type="submit" disabled={devBypass || loading}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </DemoPanel>
  );
}

function SecurityPanel() {
  const user = useSession();
  const devBypass = isDevAuthBypassEnabled();
  const passwordAvailable = user ? canChangePassword(user) : false;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<PasswordFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!passwordAvailable) {
    return (
      <DemoPanel title="Security">
        <p className="text-sm text-muted-foreground">
          Password changes are not available for accounts that sign in with an external provider.
        </p>
      </DemoPanel>
    );
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || devBypass) {
      return;
    }

    const parsed = changePasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: PasswordFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "password" || key === "confirmPassword") {
          next[key] = next[key] ?? issue.message;
        }
      }
      setErrors(next);
      setFormError(null);
      setSuccess(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) {
        setFormError(mapAuthError(error));
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess("Password updated.");
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DemoPanel title="Security">
      <form onSubmit={handleChangePassword} noValidate className="space-y-4">
        <div>
          <Label htmlFor="settings-new-password">New password</Label>
          <PasswordField
            id="settings-new-password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "settings-new-password-error" : undefined}
            disabled={devBypass || loading}
            className="mt-2"
          />
          {errors.password ? (
            <AuthFieldError id="settings-new-password-error" message={errors.password} />
          ) : null}
        </div>

        <div>
          <Label htmlFor="settings-confirm-password">Confirm new password</Label>
          <PasswordField
            id="settings-confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={errors.confirmPassword ? true : undefined}
            aria-describedby={errors.confirmPassword ? "settings-confirm-password-error" : undefined}
            disabled={devBypass || loading}
            className="mt-2"
          />
          {errors.confirmPassword ? (
            <AuthFieldError id="settings-confirm-password-error" message={errors.confirmPassword} />
          ) : null}
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        {success ? <p className="text-sm text-status-pass">{success}</p> : null}

        <Button type="submit" disabled={devBypass || loading}>
          {loading ? "Updating…" : "Change password"}
        </Button>
      </form>
    </DemoPanel>
  );
}

function AccountInformationPanel() {
  const user = useSession();
  const devBypass = isDevAuthBypassEnabled();
  const provider = user ? resolveAuthProviderLabel(user) : devBypass ? "Local dev principal" : "—";
  const lastSignIn = formatLastSignIn(user?.last_sign_in_at);

  return (
    <DemoPanel title="Account information">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Sign-in provider
          </dt>
          <dd className="mt-1 text-sm text-foreground">{provider}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Last sign-in
          </dt>
          <dd className="mt-1 text-sm text-foreground">{lastSignIn}</dd>
        </div>
      </dl>
    </DemoPanel>
  );
}

export function ProfileSettingsSection() {
  return (
    <div className="space-y-6">
      <ProfileFormPanel />
      <SecurityPanel />
      <AccountInformationPanel />
    </div>
  );
}

export function EnvironmentSettingsSection() {
  const devBypass = isDevAuthBypassEnabled();

  return (
    <DemoPanel title="Environment">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </dt>
          <dd className="mt-1 font-mono text-sm text-foreground">{WORKSPACE_NAME}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            DEV AUTH BYPASS
          </dt>
          <dd className="mt-1 font-mono text-sm text-foreground">
            {devBypass ? "Enabled" : "Disabled"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Mode
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {import.meta.env.DEV ? "Development" : "Production"}
          </dd>
        </div>
      </dl>
    </DemoPanel>
  );
}

export function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Integrations"
        description="Integrasi eksternal di luar scope hackathon sandbox. Status di bawah mencerminkan konfigurasi nyata, bukan koneksi palsu."
      />

      <DemoPanel title="Status integrasi">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Public GitHub repository ingestion — available from Projects</li>
          <li>GitHub OAuth — not connected</li>
          <li>Gemini / AI worker — used by orchestrator during approved runs</li>
          <li>Supabase auth — active in production; DEV AUTH BYPASS available for local development</li>
        </ul>
      </DemoPanel>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Settings"
        description="Manage your account profile and review BuildLoop environment details."
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="environment">Environment</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileSettingsSection />
        </TabsContent>

        <TabsContent value="environment" className="space-y-6">
          <EnvironmentSettingsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
