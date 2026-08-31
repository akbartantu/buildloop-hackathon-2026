import { describe, expect, test } from "bun:test";

import {
  DEFAULT_STICKY_HEADER_HEIGHT,
  DEFAULT_TOUR_CARD_HEIGHT,
  DEFAULT_TOUR_CARD_WIDTH,
  DEFAULT_VIEWPORT_MARGIN,
  MAX_TOUR_CARD_WIDTH,
  MIN_TOUR_CARD_WIDTH,
  availableSpaceForPlacement,
  chooseTourPlacement,
  clampTourCardPosition,
  computeTourTargetScrollDelta,
  flipTourPlacement,
  getCardBounds,
  isMobileTourViewport,
  isTourCardFullyVisible,
  placementAnchor,
  resolveTourCardPosition,
  resolveTourCardWidth,
  type TargetRect,
} from "./product-tour-placement";

const CARD = { width: DEFAULT_TOUR_CARD_WIDTH, height: DEFAULT_TOUR_CARD_HEIGHT };
const VIEWPORT_1280x720 = { width: 1280, height: 720 };
const VIEWPORT_1366x768 = { width: 1366, height: 768 };
const VIEWPORT_1440x900 = { width: 1440, height: 900 };
const VIEWPORT_1440x1024 = { width: 1440, height: 1024 };
const VIEWPORT_1920x1080 = { width: 1920, height: 1080 };
const VIEWPORT_MOBILE = { width: 390, height: 844 };

function createTaskGoalTarget(viewportHeight: number): TargetRect {
  return {
    top: viewportHeight - 120,
    left: 320,
    width: 640,
    height: 180,
  };
}

describe("product-tour placement", () => {
  test("resolveTourCardWidth stays within 320-380px on desktop", () => {
    expect(resolveTourCardWidth(VIEWPORT_1920x1080)).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH);
    expect(resolveTourCardWidth(VIEWPORT_1920x1080)).toBeLessThanOrEqual(MAX_TOUR_CARD_WIDTH);
    expect(resolveTourCardWidth(VIEWPORT_1280x720)).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH);
  });

  test("flipTourPlacement inverts axis pairs", () => {
    expect(flipTourPlacement("bottom")).toBe("top");
    expect(flipTourPlacement("top")).toBe("bottom");
    expect(flipTourPlacement("left")).toBe("right");
    expect(flipTourPlacement("right")).toBe("left");
  });

  test("bottom placement flips to top when insufficient space below", () => {
    const target = createTaskGoalTarget(VIEWPORT_1366x768.height);
    const belowSpace = availableSpaceForPlacement("bottom", target, CARD, VIEWPORT_1366x768);
    expect(belowSpace).toBeLessThan(0);

    const chosen = chooseTourPlacement("bottom", target, CARD, VIEWPORT_1366x768);
    expect(chosen).toBe("top");
  });

  test("right placement keeps readable width beside sidebar targets", () => {
    const target: TargetRect = {
      top: 120,
      left: 24,
      width: 220,
      height: 48,
    };

    const resolved = resolveTourCardPosition({
      preferredPlacement: "right",
      targetRect: target,
      card: CARD,
      viewport: VIEWPORT_1920x1080,
    });

    expect(resolved.width).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH);
    expect(resolved.maxWidth).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH);
    expect(isTourCardFullyVisible(resolved, { ...CARD, width: resolved.width }, VIEWPORT_1920x1080)).toBe(true);
  });

  test("final coordinates are clamped inside viewport with margin", () => {
    const target = createTaskGoalTarget(VIEWPORT_1366x768.height);
    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: target,
      card: CARD,
      viewport: VIEWPORT_1366x768,
    });

    expect(isTourCardFullyVisible(resolved, { ...CARD, width: resolved.width }, VIEWPORT_1366x768)).toBe(true);

    const bounds = getCardBounds(resolved.top, resolved.left, { ...CARD, width: resolved.width }, placementAnchor(resolved.placement));
    expect(bounds.top).toBeGreaterThanOrEqual(DEFAULT_STICKY_HEADER_HEIGHT + DEFAULT_VIEWPORT_MARGIN);
    expect(bounds.left).toBeGreaterThanOrEqual(DEFAULT_VIEWPORT_MARGIN);
    expect(bounds.top + bounds.height).toBeLessThanOrEqual(
      VIEWPORT_1366x768.height - DEFAULT_VIEWPORT_MARGIN,
    );
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(
      VIEWPORT_1366x768.width - DEFAULT_VIEWPORT_MARGIN,
    );
  });

  test("create-task tour step stays fully visible at common desktop sizes", () => {
    for (const viewport of [VIEWPORT_1280x720, VIEWPORT_1440x1024, VIEWPORT_1920x1080]) {
      const target: TargetRect = {
        top: viewport.height - 260,
        left: 280,
        width: 720,
        height: 220,
      };
      const resolved = resolveTourCardPosition({
        preferredPlacement: "right",
        targetRect: target,
        card: CARD,
        viewport,
      });
      expect(resolved.width).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH);
      expect(isTourCardFullyVisible(resolved, { ...CARD, width: resolved.width }, viewport)).toBe(true);
    }
  });

  test("mobile viewport uses bottom sheet layout", () => {
    expect(isMobileTourViewport(VIEWPORT_MOBILE)).toBe(true);

    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: {
        top: 420,
        left: 24,
        width: 342,
        height: 160,
      },
      card: CARD,
      viewport: VIEWPORT_MOBILE,
    });

    expect(resolved.layoutMode).toBe("sheet");
    expect(resolved.width).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH - 1);
  });

  test("missing target falls back to centered card with readable width", () => {
    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: null,
      card: CARD,
      viewport: VIEWPORT_1440x900,
    });

    expect(resolved.placement).toBe("center");
    expect(resolved.width).toBeGreaterThanOrEqual(MIN_TOUR_CARD_WIDTH);
    expect(isTourCardFullyVisible(resolved, { ...CARD, width: resolved.width }, VIEWPORT_1440x900)).toBe(true);
  });

  test("computeTourTargetScrollDelta requests scroll when card reserve exceeds viewport", () => {
    const target = createTaskGoalTarget(VIEWPORT_1366x768.height);
    const delta = computeTourTargetScrollDelta({
      targetRect: target,
      viewportHeight: VIEWPORT_1366x768.height,
      reserveBelow: CARD.height + DEFAULT_VIEWPORT_MARGIN,
    });

    expect(delta).toBeGreaterThan(0);
  });

  test("preferred bottom placement is kept when enough space exists", () => {
    const target: TargetRect = {
      top: 200,
      left: 400,
      width: 500,
      height: 120,
    };

    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: target,
      card: CARD,
      viewport: VIEWPORT_1920x1080,
    });

    expect(resolved.placement).toBe("bottom");
    expect(isTourCardFullyVisible(resolved, { ...CARD, width: resolved.width }, VIEWPORT_1920x1080)).toBe(true);
  });
});
