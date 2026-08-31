/** @jsxImportSource react */
import { registerHappyDom } from "@/test/register-happy-dom";

registerHappyDom();

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n/context";
import { buildContract } from "@/lib/task-contract";
import type { ProjectRecord } from "@/lib/projects/project-record";
import type { TaskRecord } from "@/lib/tasks-schema";
import {
  resetActiveWorkspaceStoreForTests,
  setCanonicalSelectedProjectId,
} from "@/lib/workspace/active-workspace-store";

const PROJECT_A_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_B_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_A = "akbartantu/buildloop-hackathon-2026";
const WORKSPACE_B = "akbartantu/clevia";

function makeProject(id: string, owner: string, name: string): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: `${owner}/${name}`,
    sourceType: "public_github",
    repositoryUrl: `https://github.com/${owner}/${name}`,
    repositoryOwner: owner,
    repositoryName: name,
    defaultBranch: "main",
    connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    disconnectedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTask(id: string, projectId: string, goal: string): TaskRecord {
  const now = new Date().toISOString();
  return {
    id,
    workspace: "https://github.com/akbartantu/repo",
    goal,
    status: "DRAFT",
    contract: buildContract(goal),
    blockedReasons: [],
    runnerState: null,
    createdAt: now,
    updatedAt: now,
    lockedAt: null,
    projectId,
    sourceCommitSha: null,
  };
}

const projects: ProjectRecord[] = [
  makeProject(PROJECT_A_ID, "akbartantu", "buildloop-hackathon-2026"),
  makeProject(PROJECT_B_ID, "akbartantu", "clevia"),
];

let tasksByProject: Record<string, TaskRecord[]>;

mock.module("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: ReactNode;
    to?: string;
    href?: string;
    className?: string;
  }) => <a {...props}>{children}</a>,
}));

mock.module("@/components/ui/dropdown-menu", () => {
  return {
    DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({
      children,
      asChild,
    }: {
      children: ReactNode;
      asChild?: boolean;
    }) => (asChild ? <>{children}</> : <button type="button">{children}</button>),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onClick,
      ...props
    }: {
      children: ReactNode;
      onClick?: () => void;
      className?: string;
      "data-testid"?: string;
    }) => (
      <button type="button" role="menuitem" onClick={onClick} {...props}>
        {children}
      </button>
    ),
    DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
  };
});

mock.module("@tanstack/react-start", () => ({
  useServerFn: () => {
    return async (input?: { data?: { projectId?: string | null } }) => {
      if (!input) {
        return projects;
      }
      const projectId = input.data?.projectId ?? "";
      return tasksByProject[projectId] ?? [];
    };
  },
}));

import { ProjectsProvider } from "@/hooks/use-projects";
import { WorkspaceSwitcher } from "@/components/site/workspace-switcher";
import { HomePage } from "@/components/site/pages/home-page";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function WorkspaceSwitchHarness({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ProjectsProvider>
          <div data-testid="workspace-switcher">
            <WorkspaceSwitcher />
          </div>
          <div data-testid="home-page">
            <HomePage />
          </div>
        </ProjectsProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function switcherLabel(view: ReturnType<typeof render>): string {
  const switcher = view.getByTestId("workspace-switcher");
  return within(switcher).getByRole("button").textContent ?? "";
}

async function waitForWorkspaceA(view: ReturnType<typeof render>) {
  await waitFor(() => {
    expect(switcherLabel(view)).toContain(WORKSPACE_A);
    expect(within(view.getByTestId("home-page")).getByText(WORKSPACE_A)).toBeTruthy();
    expect(view.getByText("BuildLoop task")).toBeTruthy();
    expect(within(view.getByTestId("home-page")).getByText("10")).toBeTruthy();
  });
}

async function waitForWorkspaceB(view: ReturnType<typeof render>) {
  await waitFor(() => {
    expect(switcherLabel(view)).toContain(WORKSPACE_B);
    expect(within(view.getByTestId("home-page")).getByText(WORKSPACE_B)).toBeTruthy();
    expect(view.getByText("Clevia task")).toBeTruthy();
    expect(within(view.getByTestId("home-page")).getByText("3")).toBeTruthy();
    expect(view.queryByText("BuildLoop task")).toBeNull();
  });
}

async function selectWorkspace(view: ReturnType<typeof render>, projectId: string) {
  fireEvent.click(view.getByTestId(`workspace-option-${projectId}`));
}

describe("workspace selector + home integration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    resetActiveWorkspaceStoreForTests();
    setCanonicalSelectedProjectId(PROJECT_A_ID, { userInitiated: true });
    tasksByProject = {
      [PROJECT_A_ID]: Array.from({ length: 10 }, (_, index) =>
        makeTask(
          `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
          PROJECT_A_ID,
          index === 0 ? "BuildLoop task" : `BuildLoop filler ${index}`,
        ),
      ),
      [PROJECT_B_ID]: [
        makeTask("22222222-2222-4222-8222-000000000001", PROJECT_B_ID, "Clevia task"),
        makeTask("22222222-2222-4222-8222-000000000002", PROJECT_B_ID, "Clevia filler 2"),
        makeTask("22222222-2222-4222-8222-000000000003", PROJECT_B_ID, "Clevia filler 3"),
      ],
    };
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  test("initial home and selector both resolve workspace A", async () => {
    const view = render(<WorkspaceSwitchHarness client={queryClient} />);
    await waitForWorkspaceA(view);
    expect(switcherLabel(view)).toContain(WORKSPACE_A);
    expect(within(view.getByTestId("home-page")).getByText(WORKSPACE_A)).toBeTruthy();
  });

  test("switching A → B updates selector and home without navigation", async () => {
    const view = render(<WorkspaceSwitchHarness client={queryClient} />);
    await waitForWorkspaceA(view);
    await selectWorkspace(view, PROJECT_B_ID);
    await waitForWorkspaceB(view);
    expect(switcherLabel(view)).toContain(WORKSPACE_B);
    expect(within(view.getByTestId("home-page")).queryByText(WORKSPACE_A)).toBeNull();
  });

  test("switching B → A restores workspace A everywhere", async () => {
    const view = render(<WorkspaceSwitchHarness client={queryClient} />);
    await waitForWorkspaceA(view);
    await selectWorkspace(view, PROJECT_B_ID);
    await waitForWorkspaceB(view);
    await selectWorkspace(view, PROJECT_A_ID);
    await waitForWorkspaceA(view);
    expect(view.queryByText("Clevia task")).toBeNull();
  });

  test("empty workspace B does not show workspace A task data", async () => {
    tasksByProject[PROJECT_B_ID] = [];
    const view = render(<WorkspaceSwitchHarness client={queryClient} />);
    await waitForWorkspaceA(view);
    await selectWorkspace(view, PROJECT_B_ID);

    await waitFor(() => {
      expect(switcherLabel(view)).toContain(WORKSPACE_B);
      expect(within(view.getByTestId("home-page")).getByText(/No tasks yet/)).toBeTruthy();
      expect(view.queryByText("BuildLoop task")).toBeNull();
      expect(within(view.getByTestId("home-page")).queryByText("10")).toBeNull();
    });
  });
});
