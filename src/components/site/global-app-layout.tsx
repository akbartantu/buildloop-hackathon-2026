import type { ReactNode } from "react";
import { AppShellHeader } from "@/components/site/app-shell-header";

export function GlobalAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background" data-testid="global-app-layout">
      <AppShellHeader showSearch={false} showLogo />
      <main
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
        data-tour="main-content"
      >
        {children}
      </main>
    </div>
  );
}
