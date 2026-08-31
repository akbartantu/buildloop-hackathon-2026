import { describe, expect, test } from "bun:test";

import { translate } from "@/i18n";

const taskFormSourcePath = new URL("./task-form-page.tsx", import.meta.url);

async function readTaskFormSource() {
  return Bun.file(taskFormSourcePath).text();
}

describe("task form acceptance criteria UX", () => {
  test("Accept suggested merges without replacing textarea via mergeSuggestedIntoCriteriaText", async () => {
    const source = await readTaskFormSource();
    expect(source).toContain("mergeSuggestedIntoCriteriaText");
    expect(source).not.toMatch(
      /handleAcceptSuggested[\s\S]*setAcceptanceCriteriaText\(analysis\.acceptanceCriteria\.join/,
    );
  });

  test("Add criterion focuses final textarea and prepares newline", async () => {
    const source = await readTaskFormSource();
    expect(source).toContain("prepareTextareaForNewCriterion");
    expect(source).toContain("focusCriteriaTextareaAtEnd");
    expect(source).toContain("setSelectionRange");
    expect(source).toContain('ref={criteriaTextareaRef}');
  });

  test("live criteria count uses final textarea source of truth", async () => {
    const source = await readTaskFormSource();
    expect(source).toContain("countAcceptanceCriteria(acceptanceCriteriaText)");
    expect(source).toContain('t("tasks.criteriaReadyCount"');
  });

  test("helper copy explains one criterion per line and persistence on create", async () => {
    const source = await readTaskFormSource();
    const criteriaSection = source.slice(source.indexOf('id="task-criteria"'));
    expect(criteriaSection).toContain('t("tasks.criteriaEditingHelp")');
    expect(criteriaSection).not.toContain('t("tasks.criteriaOptional")');
  });

  test("accept suggested shows non-modal confirmation", async () => {
    const source = await readTaskFormSource();
    expect(source).toContain('t("tasks.suggestedCriteriaAdded")');
    expect(source).toContain('aria-live="polite"');
  });

  test("create task parses final textarea for payload", async () => {
    const source = await readTaskFormSource();
    expect(source).toContain("parseAcceptanceCriteria(acceptanceCriteriaText)");
  });
});

describe("task form acceptance criteria i18n", () => {
  test("EN translation keys exist", () => {
    expect(translate("en", "tasks.suggestedCriteriaAdded")).toBe("Suggested criteria added");
    expect(translate("en", "tasks.criteriaEditingHelp")).toBe(
      "One criterion per line. Your edits will be saved when you create the task.",
    );
    expect(translate("en", "tasks.criteriaReadyCount", { count: 5 })).toBe("5 criteria ready");
  });

  test("ID translation keys exist", () => {
    expect(translate("id", "tasks.suggestedCriteriaAdded")).toBe("Kriteria yang disarankan ditambahkan");
    expect(translate("id", "tasks.criteriaEditingHelp")).toBe(
      "Satu kriteria per baris. Perubahan Anda akan disimpan saat task dibuat.",
    );
    expect(translate("id", "tasks.criteriaReadyCount", { count: 5 })).toBe("5 kriteria siap");
  });
});
