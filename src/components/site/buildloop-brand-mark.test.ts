import { describe, expect, test } from "bun:test";

describe("BuildLoop brand mark", () => {
  test("uses committed favicon asset", async () => {
    const source = await Bun.file(
      new URL("../../components/site/buildloop-brand-mark.tsx", import.meta.url),
    ).text();

    expect(source).toContain('src="/favicon.png"');
    expect(source).toContain("object-contain");
  });

  test("authenticated app shell no longer uses infinity icon", async () => {
    const source = await Bun.file(
      new URL("../../components/site/app-layout.tsx", import.meta.url),
    ).text();

    expect(source).toContain("BuildLoopBrandMark");
    expect(source).not.toContain("Infinity");
  });
});
