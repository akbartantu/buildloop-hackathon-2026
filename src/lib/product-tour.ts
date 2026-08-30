/** localStorage key — remove in DevTools to replay the first-time tour. */
export const PRODUCT_TOUR_STORAGE_KEY = "buildloop.productTour.completed.v1";

export type TourStepId =
  | "welcome"
  | "tasks"
  | "contract"
  | "orchestration"
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

export const PRODUCT_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "welcome",
    title: "Welcome to BuildLoop",
    body: "BuildLoop helps you complete bounded development tasks while keeping sensitive actions under human control. This workspace is where tasks, runs, evidence, and approvals are managed.",
    target: "workspace",
    placement: "right",
  },
  {
    id: "tasks",
    title: "Start with a task",
    body: "Describe what needs to change. BuildLoop turns the request into a bounded task contract before execution begins.",
    target: "nav-tasks",
    placement: "right",
  },
  {
    id: "contract",
    title: "Review the contract",
    body: "The contract defines the goal, acceptance criteria, allowed scope, and protected boundaries before BuildLoop starts working.",
    target: "tab-contract",
    fallbackTarget: "nav-tasks",
    placement: "bottom",
  },
  {
    id: "orchestration",
    title: "BuildLoop orchestrates the work",
    body: "Preflight checks the request, the worker performs the task, an independent checker verifies it, and BuildLoop can make up to two bounded correction attempts. The worker does not decide its own PASS result.",
    target: "nav-runs",
    fallbackTarget: "tab-orchestration",
    placement: "right",
  },
  {
    id: "evidence",
    title: "See why BuildLoop made its decision",
    body: "Evidence records checks, attempts, changed files, and checker results so PASS, FAILED, or BLOCKED outcomes can be inspected.",
    target: "tab-evidence",
    fallbackTarget: "nav-runs",
    placement: "bottom",
  },
  {
    id: "approval",
    title: "You stay in control",
    body: "Sensitive or irreversible actions such as commit, push, merge, or deploy require human approval before BuildLoop can continue.",
    target: "nav-approvals",
    fallbackTarget: "tab-approval",
    placement: "right",
  },
  {
    id: "finish",
    title: "You're ready",
    body: "Create a bounded task and let BuildLoop plan, execute, check, correct, and stop for approval when needed.",
    placement: "center",
  },
];

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
  return step.target;
}
