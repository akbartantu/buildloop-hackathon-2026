/** localStorage key — remove in DevTools to replay the first-time tour. */
export const PRODUCT_TOUR_STORAGE_KEY = "buildloop.productTour.completed.v2";

export type TourStepId =
  | "welcome"
  | "workspace-overview"
  | "open-workspace"
  | "workspace-shell"
  | "workspace-switcher"
  | "create-task"
  | "lifecycle"
  | "evidence"
  | "approval"
  | "finish";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export type ProductTourStep = {
  id: TourStepId;
  title: string;
  body: string;
  /** data-tour attribute value; omitted for centered steps */
  target?: string;
  placement?: TourPlacement;
  /** Fallback target when primary is missing from DOM */
  fallbackTarget?: string;
};

export type ProductTourStepDef = {
  id: TourStepId;
  titleKey: `productTour.steps.${TourStepId}.title` | `productTour.steps.open-workspace.title`;
  bodyKey:
    | `productTour.steps.${TourStepId}.body`
    | `productTour.steps.open-workspace.bodyOpen`
    | `productTour.steps.open-workspace.bodyCreate`
    | `productTour.steps.finish.bodyNoWorkspace`;
  target?: string;
  placement?: TourPlacement;
  fallbackTarget?: string;
};

export type ProductTourBuildOptions = {
  hasWorkspaces: boolean;
};

export const GLOBAL_TOUR_STEP_IDS = ["welcome", "workspace-overview", "open-workspace"] as const;

export const WORKSPACE_TOUR_STEP_IDS = [
  "workspace-shell",
  "workspace-switcher",
  "create-task",
  "lifecycle",
  "evidence",
  "approval",
] as const;

const WELCOME_STEP: ProductTourStepDef = {
  id: "welcome",
  titleKey: "productTour.steps.welcome.title",
  bodyKey: "productTour.steps.welcome.body",
  placement: "center",
};

const WORKSPACE_OVERVIEW_STEP: ProductTourStepDef = {
  id: "workspace-overview",
  titleKey: "productTour.steps.workspace-overview.title",
  bodyKey: "productTour.steps.workspace-overview.body",
  target: "workspace-overview",
  fallbackTarget: "main-content",
  placement: "bottom",
};

const WORKSPACE_SHELL_STEP: ProductTourStepDef = {
  id: "workspace-shell",
  titleKey: "productTour.steps.workspace-shell.title",
  bodyKey: "productTour.steps.workspace-shell.body",
  target: "workspace-sidebar",
  fallbackTarget: "main-content",
  placement: "right",
};

const WORKSPACE_SWITCHER_STEP: ProductTourStepDef = {
  id: "workspace-switcher",
  titleKey: "productTour.steps.workspace-switcher.title",
  bodyKey: "productTour.steps.workspace-switcher.body",
  target: "workspace-switcher",
  placement: "right",
};

const CREATE_TASK_STEP: ProductTourStepDef = {
  id: "create-task",
  titleKey: "productTour.steps.create-task.title",
  bodyKey: "productTour.steps.create-task.body",
  target: "task-goal",
  fallbackTarget: "create-task",
  placement: "right",
};

const LIFECYCLE_STEP: ProductTourStepDef = {
  id: "lifecycle",
  titleKey: "productTour.steps.lifecycle.title",
  bodyKey: "productTour.steps.lifecycle.body",
  target: "lifecycle",
  fallbackTarget: "main-content",
  placement: "right",
};

const EVIDENCE_STEP: ProductTourStepDef = {
  id: "evidence",
  titleKey: "productTour.steps.evidence.title",
  bodyKey: "productTour.steps.evidence.body",
  target: "tab-evidence",
  fallbackTarget: "nav-runs",
  placement: "bottom",
};

const APPROVAL_STEP: ProductTourStepDef = {
  id: "approval",
  titleKey: "productTour.steps.approval.title",
  bodyKey: "productTour.steps.approval.body",
  target: "nav-approvals",
  fallbackTarget: "tab-approval",
  placement: "right",
};

const FINISH_STEP: ProductTourStepDef = {
  id: "finish",
  titleKey: "productTour.steps.finish.title",
  bodyKey: "productTour.steps.finish.body",
  placement: "center",
};

const FINISH_NO_WORKSPACE_STEP: ProductTourStepDef = {
  id: "finish",
  titleKey: "productTour.steps.finish.title",
  bodyKey: "productTour.steps.finish.bodyNoWorkspace",
  placement: "center",
};

function openWorkspaceStep(hasWorkspaces: boolean): ProductTourStepDef {
  return {
    id: "open-workspace",
    titleKey: "productTour.steps.open-workspace.title",
    bodyKey: hasWorkspaces
      ? "productTour.steps.open-workspace.bodyOpen"
      : "productTour.steps.open-workspace.bodyCreate",
    target: hasWorkspaces ? "workspace-card" : "create-workspace",
    ...(hasWorkspaces ? { fallbackTarget: "create-workspace" } : {}),
    placement: "bottom",
  };
}

export function getProductTourStepDefs(options: ProductTourBuildOptions): ProductTourStepDef[] {
  const globalSteps: ProductTourStepDef[] = [
    WELCOME_STEP,
    WORKSPACE_OVERVIEW_STEP,
    openWorkspaceStep(options.hasWorkspaces),
  ];

  if (!options.hasWorkspaces) {
    return [...globalSteps, FINISH_NO_WORKSPACE_STEP];
  }

  return [
    ...globalSteps,
    WORKSPACE_SHELL_STEP,
    WORKSPACE_SWITCHER_STEP,
    CREATE_TASK_STEP,
    LIFECYCLE_STEP,
    EVIDENCE_STEP,
    APPROVAL_STEP,
    FINISH_STEP,
  ];
}

/** Full workspace tour defs for tests and documentation. */
export const PRODUCT_TOUR_STEP_DEFS = getProductTourStepDefs({ hasWorkspaces: true });

export function isGlobalTourStep(stepId: TourStepId): boolean {
  return (GLOBAL_TOUR_STEP_IDS as readonly string[]).includes(stepId);
}

export function isWorkspaceTourStep(stepId: TourStepId): boolean {
  return (WORKSPACE_TOUR_STEP_IDS as readonly string[]).includes(stepId);
}

export function buildProductTourSteps(
  t: (key: ProductTourStepDef["titleKey"] | ProductTourStepDef["bodyKey"]) => string,
  options: ProductTourBuildOptions = { hasWorkspaces: true },
): ProductTourStep[] {
  return getProductTourStepDefs(options).map((def) => ({
    id: def.id,
    title: t(def.titleKey),
    body: t(def.bodyKey),
    ...(def.target ? { target: def.target } : {}),
    ...(def.placement ? { placement: def.placement } : {}),
    ...(def.fallbackTarget ? { fallbackTarget: def.fallbackTarget } : {}),
  }));
}

function getTourStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isProductTourCompleted(): boolean {
  const storage = getTourStorage();
  if (!storage) return false;
  try {
    return storage.getItem(PRODUCT_TOUR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markProductTourCompleted(): void {
  const storage = getTourStorage();
  if (!storage) return;
  try {
    storage.setItem(PRODUCT_TOUR_STORAGE_KEY, "true");
  } catch {
    // ignore quota / privacy mode
  }
}

export function clearProductTourCompleted(): void {
  const storage = getTourStorage();
  if (!storage) return;
  try {
    storage.removeItem(PRODUCT_TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function resolveTourTarget(step: ProductTourStep): string | null {
  if (!step.target) return null;
  if (typeof document === "undefined") return step.target;

  if (document.querySelector(`[data-tour="${step.target}"]`)) {
    return step.target;
  }
  if (step.fallbackTarget && document.querySelector(`[data-tour="${step.fallbackTarget}"]`)) {
    return step.fallbackTarget;
  }
  return null;
}

export const PRODUCT_TOUR_TARGETS = [
  "workspace-overview",
  "workspace-card",
  "create-workspace",
  "workspace-sidebar",
  "workspace-switcher",
  "task-goal",
  "create-task",
  "lifecycle",
  "nav-tasks",
  "nav-runs",
  "tab-evidence",
  "nav-approvals",
  "tab-approval",
  "main-content",
] as const;
