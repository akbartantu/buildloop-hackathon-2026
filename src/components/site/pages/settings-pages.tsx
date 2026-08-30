import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import {
  formatLastSignIn,
  normalizeFullName,
  resolveAuthProviderLabel,
  resolveUserDisplayName,
} from "@/lib/auth/user-display";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { WORKSPACE_NAME } from "@/lib/task-contract";

export function ProfileSettingsSection() {
  const user = useSession();
  const devBypass = isDevAuthBypassEnabled();
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const metadata = user?.user_metadata as { full_name?: string } | undefined;
    setFullName(metadata?.full_name ?? "");
  }, [user]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || devBypass) {
      return;
    }

    const normalized = normalizeFullName(fullName);
    if (!normalized) {
      setError("Full name is required.");
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: normalized },
      });

      if (updateError) {
        setError("Could not save your profile. Please try again.");
        return;
      }

      setFullName(normalized);
      setSuccess("Profile updated.");
    } catch {
      setError("Could not save your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const email = user?.email ?? "—";
  const provider = user ? resolveAuthProviderLabel(user) : devBypass ? "Local dev principal" : "—";
  const lastSignIn = formatLastSignIn(user?.last_sign_in_at);

  return (
    <>
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
            <Label htmlFor="settings-email">Email</Label>
            <Input
              id="settings-email"
              name="email"
              value={email}
              readOnly
              disabled
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">Email is managed by Supabase Auth.</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-status-pass">{success}</p> : null}

          <Button type="submit" disabled={devBypass || loading}>
            {loading ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DemoPanel>

      <DemoPanel title="Account">
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
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Display label
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {resolveUserDisplayName({
                email: user?.email,
                userMetadata: user?.user_metadata as { full_name?: string; name?: string } | undefined,
              })}
            </dd>
          </div>
        </dl>
      </DemoPanel>
    </>
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
  const devBypass = isDevAuthBypassEnabled();

  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Settings"
        description="Manage your profile and review environment details for the BuildLoop demo."
      />

      <ProfileSettingsSection />

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
    </div>
  );
}
