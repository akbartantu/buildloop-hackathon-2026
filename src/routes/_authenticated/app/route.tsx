import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProductTourHost } from "@/components/site/product-tour-host";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppRouteLayout,
});

function AppRouteLayout() {
  return (
    <ProductTourHost>
      <Outlet />
    </ProductTourHost>
  );
}
