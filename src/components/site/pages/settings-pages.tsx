import { useEffect, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { AuthFieldError } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { IntegrationStatusRow } from "@/components/site/integration-status-row";
import { DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjects } from "@/hooks/use-projects";
import { useRuntimeSnapshot } from "@/hooks/use-runtime-snapshot";
import { useSession } from "@/hooks/use-session";
import { useWorkspaceLabel } from "@/hooks/use-workspace-label";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";
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
  resolveProfileFullName,
  resolveUserDisplayName,
} from "@/lib/auth/user-display";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { projectDisplayName } from "@/lib/projects/project-record";
import { abbreviateCommitSha } from "@/lib/repository/task-source-display";
import {
  adkIntegrationStatus,
  cloudRunIntegrationStatus,
  environmentDevBypassLabel,
  environmentModeLabel,
  environmentPersistenceLabel,
  environmentRuntimeLabel,
  firestoreIntegrationStatus,
  geminiIntegrationStatus,
  publicGitHubIntegrationStatus,
  supabaseAuthIntegrationStatus,
  type IntegrationStatusKey,
  type RuntimeSnapshot,
} from "@/lib/runtime/runtime-status";
import { WORKSPACE_NAME } from "@/lib/task-contract";

const settingsRoute = getRouteApi("/_authenticated/app/settings/");

type UserMetadata = {
  full_name?: string;
  name?: string;
  phone?: string;
};

type PasswordFieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

function statusLabel(t: (key: TranslationKey) => string, status: IntegrationStatusKey): string {
  return t(`integrations.status.${status}` as TranslationKey);
}

function EnvironmentField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function ProfileFormPanel() {
  const user = useSession();
  const { t, locale } = useI18n();
  const devBypass = isDevAuthBypassEnabled();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const metadata = user?.user_metadata as UserMetadata | undefined;
    setFullName(resolveProfileFullName(metadata));
    setPhone(metadata?.phone ?? "");
  }, [user]);

  const displayName =
    user != null
      ? resolveUserDisplayName(
          {
            email: user.email,
            userMetadata: user.user_metadata as UserMetadata | undefined,
          },
          t("common.userFallback"),
        )
      : "—";

  const languageLabel = locale === "id" ? t("language.indonesian") : t("language.english");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || devBypass) {
      return;
    }

    const normalizedName = normalizeFullName(fullName);
    if (!normalizedName) {
      setError(t("settings.profile.nameRequired"));
      setSuccess(null);
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    if (!isValidPhone(normalizedPhone)) {
      setError(t("settings.profile.phoneInvalid"));
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
        setError(t("settings.profile.saveError"));
        return;
      }

      setFullName(normalizedName);
      setPhone(normalizedPhone);
      setSuccess(t("settings.profile.updated"));
    } catch {
      setError(t("settings.profile.saveError"));
    } finally {
      setLoading(false);
    }
  }

  const email = user?.email ?? "—";

  return (
    <DemoPanel title={t("settings.profile.title")}>
      <dl className="mb-6 grid gap-4 sm:grid-cols-2">
        <EnvironmentField label={t("settings.profile.fullName")} value={displayName} />
        <EnvironmentField label={t("settings.profile.email")} value={email} />
        <EnvironmentField label={t("settings.profile.language")} value={languageLabel} />
      </dl>

      {!devBypass ? (
        <form onSubmit={handleSave} className="space-y-4 border-t border-border pt-5">
          <div>
            <Label htmlFor="settings-full-name">{t("settings.profile.fullName")}</Label>
            <Input
              id="settings-full-name"
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={loading}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="settings-phone">{t("settings.profile.phone")}</Label>
            <Input
              id="settings-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+62 812 3456 7890"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={loading}
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.profile.phoneHelp")}</p>
          </div>

          <div>
            <Label htmlFor="settings-email">{t("settings.profile.email")}</Label>
            <Input
              id="settings-email"
              name="email"
              value={email}
              readOnly
              disabled
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.profile.emailHelp")}</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-status-pass">{success}</p> : null}

          <Button type="submit" disabled={loading}>
            {loading ? t("settings.profile.saving") : t("settings.profile.save")}
          </Button>
        </form>
      ) : (
        <p className="border-t border-border pt-5 text-sm text-muted-foreground">
          {t("settings.profile.emailHelp")}
        </p>
      )}
    </DemoPanel>
  );
}

function SecurityPanel() {
  const user = useSession();
  const { t } = useI18n();
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
      <DemoPanel title={t("settings.security.title")}>
        <p className="text-sm text-muted-foreground">{t("settings.security.unavailable")}</p>
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
      setSuccess(t("settings.security.updated"));
    } catch {
      setFormError(t("settings.security.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DemoPanel title={t("settings.security.title")}>
      <form onSubmit={handleChangePassword} noValidate className="space-y-4">
        <div>
          <Label htmlFor="settings-new-password">{t("settings.security.newPassword")}</Label>
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
          <Label htmlFor="settings-confirm-password">{t("settings.security.confirmPassword")}</Label>
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
          {loading ? t("settings.security.updating") : t("settings.security.changePassword")}
        </Button>
      </form>
    </DemoPanel>
  );
}

function AccountInformationPanel() {
  const user = useSession();
  const { t } = useI18n();
  const devBypass = isDevAuthBypassEnabled();
  const provider = user
    ? resolveAuthProviderLabel(user)
    : devBypass
      ? t("settings.account.devProvider")
      : "—";
  const lastSignIn = formatLastSignIn(user?.last_sign_in_at);

  return (
    <DemoPanel title={t("settings.account.title")}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <EnvironmentField label={t("settings.account.provider")} value={provider} />
        <EnvironmentField label={t("settings.account.lastSignIn")} value={lastSignIn} />
      </dl>
    </DemoPanel>
  );
}

function PrivacyDataPanel() {
  const { t, locale } = useI18n();
  const { label: workspaceLabel } = useWorkspaceLabel();
  const languageLabel = locale === "id" ? t("language.indonesian") : t("language.english");

  return (
    <DemoPanel title={t("settings.privacy.title")}>
      <p className="text-sm text-muted-foreground">{t("settings.privacy.description")}</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("settings.privacy.language")}
          </dt>
          <dd className="mt-1 text-sm text-foreground">{languageLabel}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("settings.privacy.workspace")}
          </dt>
          <dd className="mt-1 text-sm text-foreground">{workspaceLabel}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/privacy">{t("settings.privacy.privacyPolicy")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/cookies">{t("settings.privacy.cookiePolicy")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/security">{t("settings.privacy.securityOverview")}</Link>
        </Button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {t("settings.privacy.contactNote")}
      </p>
    </DemoPanel>
  );
}

export function ProfileSettingsSection() {
  return (
    <div className="space-y-6">
      <ProfileFormPanel />
      <SecurityPanel />
      <AccountInformationPanel />
      <PrivacyDataPanel />
    </div>
  );
}

function buildEnvironmentFields(
  t: (key: TranslationKey) => string,
  input: {
    workspaceLabel: string;
    isDemo: boolean;
    sourceBranch?: string;
    sourceCommit?: string | null;
    snapshot: RuntimeSnapshot | null;
  },
) {
  const snapshot = input.snapshot;
  const activeWorkspace = input.isDemo
    ? `${WORKSPACE_NAME} — ${t("settings.demoFallback")}`
    : input.workspaceLabel;

  const source = input.isDemo ? t("settings.demoFallback") : t("settings.sourcePublicGithub");

  const branch = input.isDemo
    ? t("settings.unavailable")
    : input.sourceBranch ?? t("settings.unavailable");

  const connectedCommit = input.isDemo
    ? t("settings.unavailable")
    : input.sourceCommit
      ? abbreviateCommitSha(input.sourceCommit)
      : t("settings.unavailable");

  const mode = snapshot
    ? statusLabel(t, environmentModeLabel(snapshot))
    : t("settings.unavailable");

  const runtime = snapshot
    ? statusLabel(t, environmentRuntimeLabel(snapshot))
    : t("settings.unavailable");

  const persistence = snapshot
    ? statusLabel(t, environmentPersistenceLabel(snapshot))
    : t("settings.unavailable");

  const devBypass = snapshot
    ? statusLabel(t, environmentDevBypassLabel(snapshot))
    : isDevAuthBypassEnabled()
      ? statusLabel(t, "active")
      : statusLabel(t, "disabled");

  return {
    activeWorkspace,
    source,
    branch,
    connectedCommit,
    mode,
    runtime,
    persistence,
    devBypass,
  };
}

export function EnvironmentSettingsSection() {
  const { label: workspaceLabel, source, isDemo } = useWorkspaceLabel();
  const { data: snapshot } = useRuntimeSnapshot();
  const { t } = useI18n();

  const fields = buildEnvironmentFields(t, {
    workspaceLabel,
    isDemo,
    ...(source?.branch ? { sourceBranch: source.branch } : {}),
    sourceCommit: source?.commitSha ?? null,
    snapshot: snapshot ?? null,
  });

  return (
    <DemoPanel title={t("settings.environmentTitle")}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <EnvironmentField label={t("settings.activeWorkspace")} value={fields.activeWorkspace} />
        <EnvironmentField label={t("settings.source")} value={fields.source} />
        <EnvironmentField label={t("settings.branch")} value={fields.branch} />
        <EnvironmentField label={t("settings.connectedSourceCommit")} value={fields.connectedCommit} />
        <EnvironmentField label={t("settings.mode")} value={fields.mode} />
        <EnvironmentField label={t("settings.runtime")} value={fields.runtime} />
        <EnvironmentField label={t("settings.persistence")} value={fields.persistence} />
        <EnvironmentField label={t("settings.devAuthBypass")} value={fields.devBypass} />
      </dl>
    </DemoPanel>
  );
}

function formatProjectDate(value: string | undefined, locale: string): string {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function WorkspaceSettingsSection() {
  const { activeProject, source, isRepositoryConnected, refresh, disconnect, isHydrated } =
    useProjects();
  const { tasks, isLoading: tasksLoading } = useWorkspaceTasks();
  const { t, locale } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!activeProject) {
    return (
      <DemoPanel title={t("settings.workspaceTitle")}>
        <p className="text-sm text-muted-foreground">{t("settings.noConnectedRepository")}</p>
        <Button asChild className="mt-4">
          <Link to="/app/projects">{t("projects.connectButton")}</Link>
        </Button>
      </DemoPanel>
    );
  }

  const workspaceName = projectDisplayName(activeProject);
  const repositoryStatus = isRepositoryConnected
    ? t("projects.statusConnected")
    : t("projects.statusNotConnected");
  const connectedRepository = workspaceName;
  const sourceType = t("settings.sourcePublicGithub");
  const branch = source?.branch ?? activeProject.defaultBranch ?? t("settings.unavailable");
  const connectedCommit =
    source?.commitSha ?? activeProject.connectedCommitSha
      ? abbreviateCommitSha(source?.commitSha ?? activeProject.connectedCommitSha ?? "")
      : t("settings.unavailable");

  async function handleRefresh() {
    if (refreshing || !activeProject) {
      return;
    }

    setActionError(null);
    setRefreshing(true);
    try {
      const result = await refresh(activeProject.id);
      if (result.status === "error") {
        setActionError(result.message);
      }
    } catch {
      setActionError(t("projects.refreshError"));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDisconnect() {
    if (disconnecting || !activeProject) {
      return;
    }

    setActionError(null);
    setDisconnecting(true);
    try {
      const result = await disconnect(activeProject.id);
      if (result.status === "error") {
        setActionError(result.message);
      }
    } catch {
      setActionError(t("projects.disconnectError"));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <DemoPanel title={t("settings.workspaceTitle")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.workspaceDescription")}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        <EnvironmentField label={t("settings.workspaceName")} value={workspaceName} />
        <EnvironmentField label={t("settings.repositoryStatus")} value={repositoryStatus} />
        <EnvironmentField label={t("settings.connectedRepository")} value={connectedRepository} />
        <EnvironmentField label={t("settings.source")} value={sourceType} />
        <EnvironmentField label={t("settings.branch")} value={branch} />
        <EnvironmentField label={t("settings.connectedSourceCommit")} value={connectedCommit} />
        <EnvironmentField
          label={t("settings.createdAt")}
          value={formatProjectDate(activeProject.createdAt, locale)}
        />
        <EnvironmentField
          label={t("settings.taskCount")}
          value={tasksLoading ? "…" : String(tasks.length)}
        />
      </dl>

      {!isRepositoryConnected ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("settings.disconnectedNotice")}</p>
      ) : null}

      {actionError ? <p className="mt-4 text-sm text-destructive">{actionError}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
        {isRepositoryConnected ? (
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing || !isHydrated}>
            <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? t("projects.statusRefreshing") : t("projects.refreshRepository")}
          </Button>
        ) : null}
        {isRepositoryConnected ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={disconnecting || !isHydrated}>
                {t("projects.disconnectRepository")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("projects.disconnectConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("projects.disconnectConfirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDisconnect}>
                  {t("projects.disconnectRepository")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {!isRepositoryConnected ? (
          <Button asChild>
            <Link to="/app/projects">{t("projects.connectButton")}</Link>
          </Button>
        ) : null}
      </div>
    </DemoPanel>
  );
}

export function IntegrationsPage() {
  const { t } = useI18n();
  const { label: workspaceLabel, isDemo, isConnected } = useWorkspaceLabel();
  const { data: snapshot, isLoading } = useRuntimeSnapshot();

  const githubNote = isConnected
    ? t("integrations.connectedWorkspaceNote").replace("{workspace}", workspaceLabel)
    : t("integrations.noActiveRepository");

  const fallbackSnapshot: RuntimeSnapshot = {
    persistence: "local",
    geminiConfigured: false,
    supabaseConfigured: false,
    devAuthBypass: isDevAuthBypassEnabled(),
    isProduction: false,
  };

  const runtime = snapshot ?? fallbackSnapshot;

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("integrations.title")} description={t("integrations.description")} />

      <DemoPanel title={t("integrations.panelTitle")}>
        {isLoading && !snapshot ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div>
            <IntegrationStatusRow
              name={t("integrations.items.publicGithub.name")}
              description={t("integrations.items.publicGithub.description")}
              status={publicGitHubIntegrationStatus(isConnected)}
              note={githubNote}
            />
            <IntegrationStatusRow
              name={t("integrations.items.gemini.name")}
              description={t("integrations.items.gemini.description")}
              status={geminiIntegrationStatus(runtime)}
            />
            <IntegrationStatusRow
              name={t("integrations.items.googleAdk.name")}
              description={t("integrations.items.googleAdk.description")}
              status={adkIntegrationStatus(runtime)}
            />
            <IntegrationStatusRow
              name={t("integrations.items.supabaseAuth.name")}
              description={t("integrations.items.supabaseAuth.description")}
              status={supabaseAuthIntegrationStatus(runtime)}
            />
            <IntegrationStatusRow
              name={t("integrations.items.firestore.name")}
              description={t("integrations.items.firestore.description")}
              status={firestoreIntegrationStatus(runtime)}
            />
            <IntegrationStatusRow
              name={t("integrations.items.cloudRun.name")}
              description={t("integrations.items.cloudRun.description")}
              status={cloudRunIntegrationStatus(runtime)}
            />
          </div>
        )}
      </DemoPanel>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { tab } = settingsRoute.useSearch();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <DemoPageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          void navigate({
            to: "/app/settings",
            search: {
              tab: value as "profile" | "workspace" | "environment",
            },
          });
        }}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="profile">{t("settings.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="workspace">{t("settings.tabs.workspace")}</TabsTrigger>
          <TabsTrigger value="environment">{t("settings.tabs.environment")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileSettingsSection />
        </TabsContent>

        <TabsContent value="workspace" className="space-y-6">
          <WorkspaceSettingsSection />
        </TabsContent>

        <TabsContent value="environment" className="space-y-6">
          <EnvironmentSettingsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Exported for tests
export { buildEnvironmentFields };
