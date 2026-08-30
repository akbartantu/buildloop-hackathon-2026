type RuntimeErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type PreviewTelemetryBridge = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: RuntimeErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    /** Optional preview-surface telemetry bridge. */
    __buildloopPreviewTelemetry?: PreviewTelemetryBridge;
  }
}

/** Reports client runtime errors locally and to optional preview telemetry bridges. */
export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  console.error(error);

  window.__buildloopPreviewTelemetry?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
