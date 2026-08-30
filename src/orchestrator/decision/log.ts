import type { DecisionLogEntry } from "../types";

export class DecisionLog {
  private entries: DecisionLogEntry[] = [];

  append(entry: DecisionLogEntry): void {
    this.entries.push(entry);
  }

  list(runId?: string): DecisionLogEntry[] {
    if (!runId) return [...this.entries];
    return this.entries.filter((entry) => entry.runId === runId);
  }

  createEntry(input: Omit<DecisionLogEntry, "id" | "createdAt">): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.append(entry);
    return entry;
  }
}
