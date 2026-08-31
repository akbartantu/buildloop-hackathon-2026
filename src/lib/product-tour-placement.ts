import type { TourPlacement } from "./product-tour";

export type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type CardSize = {
  width: number;
  height: number;
};

export type CardAnchor = "bottom-center-x" | "top-center-x" | "left-center-y" | "right-center-y" | "center";

export type TourLayoutMode = "anchored" | "sheet";

export type ResolvedTourCardPosition = {
  layoutMode: TourLayoutMode;
  placement: TourPlacement;
  top: number;
  left: number;
  transform: string;
  width: number;
  maxWidth: number;
  maxHeight: number;
};

export const MIN_TOUR_CARD_WIDTH = 320;
export const MAX_TOUR_CARD_WIDTH = 380;
export const DEFAULT_TOUR_CARD_WIDTH = 340;
export const DEFAULT_TOUR_CARD_HEIGHT = 240;
export const DEFAULT_VIEWPORT_MARGIN = 16;
export const DEFAULT_TOUR_GAP = 12;
export const DEFAULT_STICKY_HEADER_HEIGHT = 56;
export const MOBILE_TOUR_MAX_WIDTH = 640;

const OPPOSITE_PLACEMENT: Record<Exclude<TourPlacement, "center">, Exclude<TourPlacement, "center">> =
  {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };

export function isMobileTourViewport(viewport: ViewportSize): boolean {
  return viewport.width < MOBILE_TOUR_MAX_WIDTH;
}

export function resolveTourCardWidth(viewport: ViewportSize): number {
  const available = viewport.width - DEFAULT_VIEWPORT_MARGIN * 2;
  if (available <= MIN_TOUR_CARD_WIDTH) {
    return Math.max(280, available);
  }
  return Math.min(MAX_TOUR_CARD_WIDTH, Math.max(MIN_TOUR_CARD_WIDTH, Math.min(DEFAULT_TOUR_CARD_WIDTH, available)));
}

export function flipTourPlacement(
  placement: Exclude<TourPlacement, "center">,
): Exclude<TourPlacement, "center"> {
  return OPPOSITE_PLACEMENT[placement];
}

export function placementAnchor(placement: TourPlacement): CardAnchor {
  switch (placement) {
    case "top":
      return "top-center-x";
    case "left":
      return "right-center-y";
    case "right":
      return "left-center-y";
    case "bottom":
      return "bottom-center-x";
    case "center":
    default:
      return "center";
  }
}

export function placementTransform(placement: TourPlacement): string {
  switch (placement) {
    case "top":
      return "translate(-50%, -100%)";
    case "left":
      return "translate(-100%, -50%)";
    case "right":
      return "translateY(-50%)";
    case "bottom":
      return "translateX(-50%)";
    case "center":
    default:
      return "translate(-50%, -50%)";
  }
}

export function getCardBounds(
  anchorTop: number,
  anchorLeft: number,
  card: CardSize,
  anchor: CardAnchor,
): TargetRect {
  switch (anchor) {
    case "bottom-center-x":
      return {
        top: anchorTop,
        left: anchorLeft - card.width / 2,
        width: card.width,
        height: card.height,
      };
    case "top-center-x":
      return {
        top: anchorTop - card.height,
        left: anchorLeft - card.width / 2,
        width: card.width,
        height: card.height,
      };
    case "left-center-y":
      return {
        top: anchorTop - card.height / 2,
        left: anchorLeft,
        width: card.width,
        height: card.height,
      };
    case "right-center-y":
      return {
        top: anchorTop - card.height / 2,
        left: anchorLeft - card.width,
        width: card.width,
        height: card.height,
      };
    case "center":
    default:
      return {
        top: anchorTop - card.height / 2,
        left: anchorLeft - card.width / 2,
        width: card.width,
        height: card.height,
      };
  }
}

export function availableSpaceForPlacement(
  placement: Exclude<TourPlacement, "center">,
  target: TargetRect,
  card: CardSize,
  viewport: ViewportSize,
  options?: {
    margin?: number;
    gap?: number;
    headerOffset?: number;
  },
): number {
  const margin = options?.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const gap = options?.gap ?? DEFAULT_TOUR_GAP;
  const headerOffset = options?.headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;
  const safeTop = headerOffset + margin;
  const safeBottom = viewport.height - margin;
  const safeLeft = margin;
  const safeRight = viewport.width - margin;

  switch (placement) {
    case "bottom":
      return safeBottom - (target.top + target.height + gap + card.height);
    case "top":
      return target.top - gap - card.height - safeTop;
    case "right":
      return safeRight - (target.left + target.width + gap + card.width);
    case "left":
      return target.left - gap - card.width - safeLeft;
  }
}

export function chooseTourPlacement(
  preferred: Exclude<TourPlacement, "center">,
  target: TargetRect,
  card: CardSize,
  viewport: ViewportSize,
  options?: {
    margin?: number;
    gap?: number;
    headerOffset?: number;
  },
): Exclude<TourPlacement, "center"> {
  const preferredSpace = availableSpaceForPlacement(preferred, target, card, viewport, options);
  if (preferredSpace >= 0) {
    return preferred;
  }

  const flipped = flipTourPlacement(preferred);
  const flippedSpace = availableSpaceForPlacement(flipped, target, card, viewport, options);
  if (flippedSpace > preferredSpace) {
    return flipped;
  }

  if (preferred === "bottom" || preferred === "top") {
    const bottomSpace = availableSpaceForPlacement("bottom", target, card, viewport, options);
    const topSpace = availableSpaceForPlacement("top", target, card, viewport, options);
    return topSpace >= bottomSpace ? "top" : "bottom";
  }

  if (preferred === "left" || preferred === "right") {
    const rightSpace = availableSpaceForPlacement("right", target, card, viewport, options);
    const leftSpace = availableSpaceForPlacement("left", target, card, viewport, options);
    return leftSpace >= rightSpace ? "left" : "right";
  }

  return preferred;
}

export function anchorPointForPlacement(
  placement: Exclude<TourPlacement, "center">,
  target: TargetRect,
  gap: number,
): { top: number; left: number } {
  switch (placement) {
    case "right":
      return {
        top: target.top + target.height / 2,
        left: target.left + target.width + gap,
      };
    case "left":
      return {
        top: target.top + target.height / 2,
        left: target.left - gap,
      };
    case "top":
      return {
        top: target.top - gap,
        left: target.left + target.width / 2,
      };
    case "bottom":
    default:
      return {
        top: target.top + target.height + gap,
        left: target.left + target.width / 2,
      };
  }
}

export function clampTourCardPosition(input: {
  placement: TourPlacement;
  top: number;
  left: number;
  card: CardSize;
  viewport: ViewportSize;
  margin?: number;
  headerOffset?: number;
}): { top: number; left: number } {
  const margin = input.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const headerOffset = input.headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;
  const anchor = placementAnchor(input.placement);
  let { top, left } = input;

  const safeTop = headerOffset + margin;
  const safeBottom = input.viewport.height - margin;
  const safeLeft = margin;
  const safeRight = input.viewport.width - margin;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const bounds = getCardBounds(top, left, input.card, anchor);

    let deltaTop = 0;
    let deltaLeft = 0;

    if (bounds.top < safeTop) {
      deltaTop = safeTop - bounds.top;
    } else if (bounds.top + bounds.height > safeBottom) {
      deltaTop = safeBottom - (bounds.top + bounds.height);
    }

    if (bounds.left < safeLeft) {
      deltaLeft = safeLeft - bounds.left;
    } else if (bounds.left + bounds.width > safeRight) {
      deltaLeft = safeRight - (bounds.left + bounds.width);
    }

    if (deltaTop === 0 && deltaLeft === 0) {
      break;
    }

    top += deltaTop;
    left += deltaLeft;
  }

  return { top, left };
}

function resolveMaxHeight(viewport: ViewportSize, margin?: number, headerOffset?: number): number {
  const resolvedMargin = margin ?? DEFAULT_VIEWPORT_MARGIN;
  const resolvedHeader = headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;
  return viewport.height - resolvedHeader - resolvedMargin * 2;
}

function resolveSheetPosition(input: {
  card: CardSize;
  viewport: ViewportSize;
  margin?: number;
}): ResolvedTourCardPosition {
  const margin = input.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const cardWidth = resolveTourCardWidth(input.viewport);
  const width = Math.min(cardWidth, input.viewport.width - margin * 2);
  const left = (input.viewport.width - width) / 2;
  const top = input.viewport.height - margin - input.card.height;

  return {
    layoutMode: "sheet",
    placement: "bottom",
    top: Math.max(margin + DEFAULT_STICKY_HEADER_HEIGHT, top),
    left,
    transform: "none",
    width,
    maxWidth: width,
    maxHeight: resolveMaxHeight(input.viewport, margin),
  };
}

function resolveCenteredPosition(input: {
  card: CardSize;
  viewport: ViewportSize;
  margin?: number;
  headerOffset?: number;
}): ResolvedTourCardPosition {
  const margin = input.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const headerOffset = input.headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;
  const cardWidth = resolveTourCardWidth(input.viewport);
  const clamped = clampTourCardPosition({
    placement: "center",
    top: input.viewport.height / 2,
    left: input.viewport.width / 2,
    card: { ...input.card, width: cardWidth },
    viewport: input.viewport,
    margin,
    headerOffset,
  });

  return {
    layoutMode: "anchored",
    placement: "center",
    top: clamped.top,
    left: clamped.left,
    transform: placementTransform("center"),
    width: cardWidth,
    maxWidth: cardWidth,
    maxHeight: resolveMaxHeight(input.viewport, margin, headerOffset),
  };
}

export function resolveTourCardPosition(input: {
  preferredPlacement?: TourPlacement;
  targetRect: TargetRect | null;
  card: CardSize;
  viewport: ViewportSize;
  margin?: number;
  gap?: number;
  headerOffset?: number;
  forceSheet?: boolean;
}): ResolvedTourCardPosition {
  const margin = input.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const gap = input.gap ?? DEFAULT_TOUR_GAP;
  const headerOffset = input.headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;
  const cardWidth = resolveTourCardWidth(input.viewport);
  const card = { ...input.card, width: cardWidth };
  const maxHeight = resolveMaxHeight(input.viewport, margin, headerOffset);

  if (input.forceSheet || isMobileTourViewport(input.viewport)) {
    return resolveSheetPosition({ card, viewport: input.viewport, margin });
  }

  if (!input.targetRect || input.preferredPlacement === "center" || !input.preferredPlacement) {
    return resolveCenteredPosition({ card, viewport: input.viewport, margin, headerOffset });
  }

  const preferred = input.preferredPlacement as Exclude<TourPlacement, "center">;
  const placement = chooseTourPlacement(preferred, input.targetRect, card, input.viewport, {
    margin,
    gap,
    headerOffset,
  });

  const anchor = anchorPointForPlacement(placement, input.targetRect, gap);
  const clamped = clampTourCardPosition({
    placement,
    top: anchor.top,
    left: anchor.left,
    card,
    viewport: input.viewport,
    margin,
    headerOffset,
  });

  const availableWidth =
    placement === "right"
      ? input.viewport.width - margin - (input.targetRect.left + input.targetRect.width + gap)
      : placement === "left"
        ? input.targetRect.left - gap - margin
        : input.viewport.width - margin * 2;

  const resolvedMaxWidth = Math.max(MIN_TOUR_CARD_WIDTH, Math.min(MAX_TOUR_CARD_WIDTH, availableWidth));

  return {
    layoutMode: "anchored",
    placement,
    top: clamped.top,
    left: clamped.left,
    transform: placementTransform(placement),
    width: Math.min(cardWidth, resolvedMaxWidth),
    maxWidth: resolvedMaxWidth,
    maxHeight,
  };
}

/** Scroll delta (px) needed so target + optional card reserve fit in the safe viewport band. */
export function computeTourTargetScrollDelta(input: {
  targetRect: TargetRect;
  viewportHeight: number;
  margin?: number;
  headerOffset?: number;
  reserveBelow?: number;
  reserveAbove?: number;
}): number {
  const margin = input.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const headerOffset = input.headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;
  const reserveBelow = input.reserveBelow ?? 0;
  const reserveAbove = input.reserveAbove ?? 0;

  const safeTop = headerOffset + margin + reserveAbove;
  const safeBottom = input.viewportHeight - margin - reserveBelow;

  if (input.targetRect.top < safeTop) {
    return input.targetRect.top - safeTop;
  }

  const targetBottomWithReserve = input.targetRect.top + input.targetRect.height + reserveBelow;
  if (targetBottomWithReserve > safeBottom) {
    return targetBottomWithReserve - safeBottom;
  }

  return 0;
}

export function estimateReserveForPlacement(
  placement: TourPlacement,
  card: CardSize,
  gap?: number,
): { above: number; below: number } {
  const tourGap = gap ?? DEFAULT_TOUR_GAP;
  switch (placement) {
    case "top":
      return { above: card.height + tourGap, below: 0 };
    case "bottom":
      return { above: 0, below: card.height + tourGap };
    case "left":
    case "right":
      return { above: card.height / 2, below: card.height / 2 };
    case "center":
    default:
      return { above: 0, below: 0 };
  }
}

export function isTourCardFullyVisible(
  position: ResolvedTourCardPosition,
  card: CardSize,
  viewport: ViewportSize,
  options?: { margin?: number; headerOffset?: number },
): boolean {
  const margin = options?.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const headerOffset = options?.headerOffset ?? DEFAULT_STICKY_HEADER_HEIGHT;

  if (position.layoutMode === "sheet") {
    return (
      position.top >= headerOffset + margin &&
      position.top + card.height <= viewport.height - margin &&
      position.width >= MIN_TOUR_CARD_WIDTH - 1
    );
  }

  const bounds = getCardBounds(position.top, position.left, card, placementAnchor(position.placement));

  return (
    bounds.top >= headerOffset + margin &&
    bounds.left >= margin &&
    bounds.top + bounds.height <= viewport.height - margin &&
    bounds.left + bounds.width <= viewport.width - margin &&
    bounds.width >= MIN_TOUR_CARD_WIDTH - 1
  );
}
