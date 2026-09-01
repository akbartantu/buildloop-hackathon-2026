import { createContext, useContext, type ReactNode } from "react";
import { ProductTour, useProductTourController } from "@/components/site/product-tour";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspaceTasks } from "@/hooks/use-workspace-tasks";

type ProductTourControllerValue = ReturnType<typeof useProductTourController>;

const ProductTourContext = createContext<ProductTourControllerValue | null>(null);

export function useProductTour(): ProductTourControllerValue | null {
  return useContext(ProductTourContext);
}

export function ProductTourHost({ children }: { children: ReactNode }) {
  const { projects } = useProjects();
  const { tasks } = useWorkspaceTasks();
  const latestTask = tasks[0] ?? null;
  const hasRunEvidence = Boolean(latestTask?.runnerState?.runnerInvoked);
  const hasWorkspaces = projects.length > 0;
  const tour = useProductTourController(latestTask?.id ?? null, hasRunEvidence);

  return (
    <ProductTourContext.Provider value={tour}>
      {children}
      <ProductTour
        active={tour.isActive}
        stepIndex={tour.stepIndex}
        latestTaskId={latestTask?.id ?? null}
        hasRunEvidence={hasRunEvidence}
        hasWorkspaces={hasWorkspaces}
        onClose={tour.close}
        onStepChange={tour.setStepIndex}
      />
    </ProductTourContext.Provider>
  );
}
