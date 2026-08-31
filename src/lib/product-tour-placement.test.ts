import { describe, expect, test } from "bun:test";

import {
  DEFAULT_STICKY_HEADER_HEIGHT,
  DEFAULT_TOUR_CARD_HEIGHT,
  DEFAULT_TOUR_CARD_WIDTH,
  DEFAULT_TOUR_GAP,
  DEFAULT_VIEWPORT_MARGIN,
  availableSpaceForPlacement,
  chooseTourPlacement,
  clampTourCardPosition,
  computeTourTargetScrollDelta,
  flipTourPlacement,
  getCardBounds,
  isTourCardFullyVisible,
  placementAnchor,
  resolveTourCardPosition,
  type TargetRect,
} from "./product-tour-placement";

const CARD = { width: DEFAULT_TOUR_CARD_WIDTH, height: DEFAULT_TOUR_CARD_HEIGHT };
const VIEWPORT_1366x768 = { width: 1366, height: 768 };
const VIEWPORT_1440x900 = { width: 1440, height: 900 };
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

  test("top flips to bottom when insufficient space above", () => {
    const target: TargetRect = {
      top: DEFAULT_STICKY_HEADER_HEIGHT + DEFAULT_VIEWPORT_MARGIN + 8,
      left: 200,
      width: 400,
      height: 120,
    };

    const aboveSpace = availableSpaceForPlacement("top", target, CARD, VIEWPORT_1366x768);
    expect(aboveSpace).toBeLessThan(0);

    const chosen = chooseTourPlacement("top", target, CARD, VIEWPORT_1366x768);
    expect(chosen).toBe("bottom");
  });

  test("final coordinates are clamped inside viewport with margin", () => {
    const target = createTaskGoalTarget(VIEWPORT_1366x768.height);
    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: target,
      card: CARD,
      viewport: VIEWPORT_1366x768,
    });

    expect(isTourCardFullyVisible(resolved, CARD, VIEWPORT_1366x768)).toBe(true);

    const bounds = getCardBounds(resolved.top, resolved.left, CARD, placementAnchor(resolved.placement));
    expect(bounds.top).toBeGreaterThanOrEqual(DEFAULT_STICKY_HEADER_HEIGHT + DEFAULT_VIEWPORT_MARGIN);
    expect(bounds.left).toBeGreaterThanOrEqual(DEFAULT_VIEWPORT_MARGIN);
    expect(bounds.top + bounds.height).toBeLessThanOrEqual(
      VIEWPORT_1366x768.height - DEFAULT_VIEWPORT_MARGIN,
    );
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(
      VIEWPORT_1366x768.width - DEFAULT_VIEWPORT_MARGIN,
    );
  });

  test("create-task tour step stays fully visible at 1366x768", () => {
    const target = createTaskGoalTarget(VIEWPORT_1366x768.height);
    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: target,
      card: CARD,
      viewport: VIEWPORT_1366x768,
    });

    expect(["top", "bottom"]).toContain(resolved.placement);
    expect(isTourCardFullyVisible(resolved, CARD, VIEWPORT_1366x768)).toBe(true);
  });

  test("create-task tour step stays fully visible at common desktop sizes", () => {
    const target = createTaskGoalTarget(VIEWPORT_1440x900.height);

    for (const viewport of [VIEWPORT_1366x768, VIEWPORT_1440x900, VIEWPORT_1920x1080]) {
      const resolved = resolveTourCardPosition({
        preferredPlacement: "bottom",
        targetRect: { ...target, top: viewport.height - 140 },
        card: CARD,
        viewport,
      });
      expect(isTourCardFullyVisible(resolved, CARD, viewport)).toBe(true);
    }
  });

  test("narrow mobile viewport keeps card inside bounds", () => {
    const target: TargetRect = {
      top: 420,
      left: 24,
      width: 342,
      height: 160,
    };

    const resolved = resolveTourCardPosition({
      preferredPlacement: "bottom",
      targetRect: target,
      card: { width: 320, height: DEFAULT_TOUR_CARD_HEIGHT },
      viewport: VIEWPORT_MOBILE,
    });

    expect(isTourCardFullyVisible(resolved, CARD, VIEWPORT_MOBILE)).toBe(true);
  });

  test("clampTourCardPosition respects minimum viewport margin", () => {
    const clamped = clampTourCardPosition({
      placement: "bottom",
      top: VIEWPORT_1366x768.height - 40,
      left: VIEWPORT_1366x768.width / 2,
      card: CARD,
      viewport: VIEWPORT_1366x768,
    });

    const bounds = getCardBounds(clamped.top, clamped.left, CARD, "bottom-center-x");
    expect(bounds.top + bounds.height).toBeLessThanOrEqual(
      VIEWPORT_1366x768.height - DEFAULT_VIEWPORT_MARGIN,
    );
  });

  test("computeTourTargetScrollDelta requests scroll when card reserve exceeds viewport", () => {
    const target = createTaskGoalTarget(VIEWPORT_1366x768.height);
    const delta = computeTourTargetScrollDelta({
      targetRect: target,
      viewportHeight: VIEWPORT_1366x768.height,
      reserveBelow: CARD.height + DEFAULT_TOUR_GAP,
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
    expect(isTourCardFullyVisible(resolved, CARD, VIEWPORT_1920x1080)).toBe(true);
  });
});
