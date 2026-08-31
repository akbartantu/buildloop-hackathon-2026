import { describe, expect, test } from "bun:test";

describe("BuildLoop brand mark", () => {
  test("uses committed favicon asset", async () => {
    const source = await Bun.file(
      new URL("./buildloop-brand-mark.tsx", import.meta.url),
    ).text();

    expect(source).toContain('src="/favicon.png"');
    expect(source).toContain("object-contain");
  });

  test("canonical BuildLoopLogo wraps the brand mark", async () => {
    const logoSource = await Bun.file(new URL("./buildloop-logo.tsx", import.meta.url)).text();
    expect(logoSource).toContain("BuildLoopBrandMark");
    expect(logoSource).toContain("BuildLoop");
  });

  test("landing header uses canonical BuildLoopLogo", async () => {
    const source = await Bun.file(new URL("./site-header.tsx", import.meta.url)).text();
    expect(source).toContain("BuildLoopLogo");
    expect(source).not.toContain('className="h-5 w-[2px] bg-boundary"');
  });

  test("authenticated app shell uses canonical BuildLoopLogo", async () => {
    const source = await Bun.file(new URL("./app-layout.tsx", import.meta.url)).text();
    expect(source).toContain("BuildLoopLogo");
    expect(source).not.toContain("Infinity");
  });

  test("auth shell uses canonical BuildLoopLogo", async () => {
    const source = await Bun.file(
      new URL("../auth/auth-shell.tsx", import.meta.url),
    ).text();
    expect(source).toContain("BuildLoopLogo");
  });
});
