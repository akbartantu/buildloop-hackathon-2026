import { DemoBulletList, DemoPageHeader, DemoPanel } from "@/components/site/demo-ui";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth-bypass";
import { WORKSPACE_NAME } from "@/lib/task-contract";

export function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <DemoPageHeader
        title="Integrations"
        description="Integrasi eksternal di luar scope hackathon sandbox. Status di bawah mencerminkan konfigurasi nyata, bukan koneksi palsu."
      />

      <DemoPanel title="Status integrasi">
        <DemoBulletList
          items={[
            `Workspace: ${WORKSPACE_NAME} — controlled local sandbox (bukan GitHub OAuth)`,
            "GitHub: tidak terhubung — di luar scope demo hackathon",
            "Gemini / AI worker: digunakan oleh orchestrator lokal saat run dijalankan",
            "Supabase auth: aktif di production; DEV AUTH BYPASS tersedia untuk pengembangan lokal",
          ]}
        />
      </DemoPanel>

      <DemoPanel title="Mengapa belum tersedia">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Hackathon vertical slice BuildLoop fokus pada alur Task → Contract → Orchestrator → Checker →
          Approval. Integrasi repository eksternal, OAuth, dan webhook akan ditambahkan setelah slice inti
          terbukti stabil.
        </p>
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
        description="Konfigurasi nyata yang relevan untuk BuildLoop demo — tanpa toggle palsu."
      />

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
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Auth provider
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {devBypass ? "Local dev principal" : "Supabase"}
            </dd>
          </div>
        </dl>
      </DemoPanel>

      <DemoPanel title="Kebijakan">
        <DemoBulletList
          items={[
            "Contract wajib sebelum orchestrator dijalankan",
            "Protected paths tidak dapat diubah otomatis",
            "Commit, push, merge, deploy membutuhkan approval manusia",
            "Pengaturan tim dan policy lanjutan — coming soon",
          ]}
        />
      </DemoPanel>
    </div>
  );
}
