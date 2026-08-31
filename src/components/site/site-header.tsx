import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { BuildLoopLogo } from "@/components/site/buildloop-logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/hooks/use-session";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { usePublicI18n } from "@/i18n/use-public-i18n";

const linkClass =
  "relative text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-foreground after:transition-[width] hover:after:w-full focus-visible:after:w-full";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const user = useSession();
  const { pt } = usePublicI18n();

  const navLinks = [
    { label: pt("header.howItWorks"), to: "/" as const, hash: "how-it-works" },
    { label: pt("header.features"), to: "/" as const, hash: "features" },
    { label: pt("header.pricing"), to: "/" as const, hash: "pricing" },
    { label: pt("header.faq"), to: "/" as const, hash: "faq" },
  ];

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ||
    (user?.user_metadata?.["name"] as string | undefined) ||
    user?.email?.split("@")[0] ||
    pt("header.userFallback");
  const avatarUrl = user?.user_metadata?.["avatar_url"] as string | undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <nav
        aria-label={pt("header.navLabel")}
        className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6"
      >
        <Link
          to="/"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="BuildLoop home"
        >
          <BuildLoopLogo wordmarkClassName="text-[15px] text-foreground" />
        </Link>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <LanguageSwitcher className="hidden sm:inline-flex" />

          <div className="hidden items-center gap-5 text-[13px] md:flex">
            {navLinks.map((item) => (
              <Link key={item.hash} to={item.to} hash={item.hash} className={linkClass}>
                {item.label}
              </Link>
            ))}
            <Link to="/docs" className={linkClass}>
              {pt("header.docs")}
            </Link>

            {user ? (
              <>
                <Link to="/app" className={linkClass}>
                  {pt("header.app")}
                </Link>
                <Link
                  to="/app"
                  className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={pt("header.workspaceAria")}
                >
                  <Avatar className="size-6 border border-border">
                    <AvatarImage src={avatarUrl} alt={displayName} />
                    <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </>
            ) : (
              <>
                <Link to="/auth" className={linkClass}>
                  {pt("header.signIn")}
                </Link>
                <Link
                  to="/auth/sign-up"
                  className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {pt("header.signUp")}
                </Link>
              </>
            )}
          </div>

          {!user ? (
            <Link
              to="/auth/sign-up"
              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
            >
              {pt("header.signUp")}
            </Link>
          ) : null}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label={pt("header.openMenu")}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              <Menu className="size-4" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[82vw] max-w-xs">
              <SheetHeader>
                <SheetTitle className="text-left text-sm">{pt("header.menuTitle")}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 px-4">
                <LanguageSwitcher />
              </div>
              <div className="mt-2 flex flex-col border-t border-border">
                {navLinks.map((item) => (
                  <Link
                    key={item.hash}
                    to={item.to}
                    hash={item.hash}
                    onClick={() => setOpen(false)}
                    className="border-b border-border px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:bg-accent"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  to="/docs"
                  onClick={() => setOpen(false)}
                  className="border-b border-border px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:bg-accent"
                >
                  {pt("header.docs")}
                </Link>

                {user ? (
                  <>
                    <Link
                      to="/app"
                      onClick={() => setOpen(false)}
                      className="border-b border-border px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:bg-accent"
                    >
                      {pt("header.app")}
                    </Link>
                    <Link
                      to="/app"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border-b border-border px-4 py-3 focus-visible:outline-none focus-visible:bg-accent"
                    >
                      <Avatar className="size-6 border border-border">
                        <AvatarImage src={avatarUrl} alt={displayName} />
                        <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-foreground">{displayName}</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/auth"
                      onClick={() => setOpen(false)}
                      className="border-b border-border px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:bg-accent"
                    >
                      {pt("header.signIn")}
                    </Link>
                    <Link
                      to="/auth/sign-up"
                      onClick={() => setOpen(false)}
                      className="border-b border-border px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:bg-accent"
                    >
                      {pt("header.signUp")}
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
