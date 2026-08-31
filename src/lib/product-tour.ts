/** localStorage key — remove in DevTools to replay the first-time tour. */
export const PRODUCT_TOUR_STORAGE_KEY = "buildloop.productTour.completed.v2";

export type TourStepId =
  | "workspace"
  | "repository"
  | "specifications"
  | "create-task"
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

export type ProductTourStepDef = {
  id: TourStepId;
  titleKey: `productTour.steps.${TourStepId}.title`;
  bodyKey: `productTour.steps.${TourStepId}.body`;
  target?: string;
  placement?: TourPlacement;
  fallbackTarget?: string;
};

export const PRODUCT_TOUR_STEP_DEFS: ProductTourStepDef[] = [
  {
    id: "workspace",
    titleKey: "productTour.steps.workspace.title",
    bodyKey: "productTour.steps.workspace.body",
    target: "workspace",
    placement: "right",
  },
  {
    id: "repository",
    titleKey: "productTour.steps.repository.title",
    bodyKey: "productTour.steps.repository.body",
    target: "projects-repository",
    fallbackTarget: "nav-projects",
    placement: "bottom",
  },
  {
    id: "specifications",
    titleKey: "productTour.steps.specifications.title",
    bodyKey: "productTour.steps.specifications.body",
    target: "projects-specifications",
    fallbackTarget: "nav-projects",
    placement: "top",
  },
  {
    id: "create-task",
    titleKey: "productTour.steps.create-task.title",
    bodyKey: "productTour.steps.create-task.body",
    target: "task-goal",
    fallbackTarget: "nav-tasks",
    placement: "bottom",
  },
  {
    id: "contract",
    titleKey: "productTour.steps.contract.title",
    bodyKey: "productTour.steps.contract.body",
    target: "tab-contract",
    fallbackTarget: "nav-tasks",
    placement: "bottom",
  },
  {
    id: "orchestration",
    titleKey: "productTour.steps.orchestration.title",
    bodyKey: "productTour.steps.orchestration.body",
    target: "nav-runs",
    fallbackTarget: "tab-orchestration",
    placement: "right",
  },
  {
    id: "evidence",
    titleKey: "productTour.steps.evidence.title",
    bodyKey: "productTour.steps.evidence.body",
    target: "tab-evidence",
    fallbackTarget: "nav-runs",
    placement: "bottom",
  },
  {
    id: "approval",
    titleKey: "productTour.steps.approval.title",
    bodyKey: "productTour.steps.approval.body",
    target: "nav-approvals",
    fallbackTarget: "tab-approval",
    placement: "right",
  },
  {
    id: "finish",
    titleKey: "productTour.steps.finish.title",
    bodyKey: "productTour.steps.finish.body",
    placement: "center",
  },
];

/** @deprecated Use buildProductTourSteps() for localized copy. */
export const PRODUCT_TOUR_STEPS: ProductTourStep[] = PRODUCT_TOUR_STEP_DEFS.map((def) => ({
  id: def.id,
  title: def.titleKey,
  body: def.bodyKey,
  ...(def.target ? { target: def.target } : {}),
  ...(def.placement ? { placement: def.placement } : {}),
  ...(def.fallbackTarget ? { fallbackTarget: def.fallbackTarget } : {}),
}));

export function buildProductTourSteps(
  t: (key: ProductTourStepDef["titleKey"] | ProductTourStepDef["bodyKey"]) => string,
): ProductTourStep[] {
  return PRODUCT_TOUR_STEP_DEFS.map((def) => ({
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
  return step.target;
}

export const PRODUCT_TOUR_TARGETS = [
  "workspace",
  "nav-projects",
  "projects-repository",
  "projects-specifications",
  "task-goal",
  "nav-tasks",
  "tab-contract",
  "nav-runs",
  "tab-orchestration",
  "tab-evidence",
  "nav-approvals",
  "tab-approval",
  "main-content",
] as const;
