import { describe, expect, it } from "vitest";
import { availableViews, defaultView, formatFloat, inspectSequence, turn, viewUrl, type ListingView } from "./inspect";

const weapon: ListingView = { link: null, views: ["a", "l", "r", "h"], float: 0.1, pattern: 1, listings: 1 };
const gloves: ListingView = { ...weapon, views: ["a", "l", "r"] };

describe("inspect views", () => {
  it("maps Steam's render order to views", () => {
    expect([viewUrl(weapon, "angle"), viewUrl(weapon, "left"), viewUrl(weapon, "right"), viewUrl(weapon, "hand")]).toEqual(["a", "l", "r", "h"]);
    expect(viewUrl(gloves, "hand")).toBeNull();
  });

  it("starts in hand like the game, or at 3/4 for gloves", () => {
    expect(defaultView(weapon)).toBe("hand");
    expect(defaultView(gloves)).toBe("angle");
    expect(availableViews(gloves)).toEqual(["angle", "left", "right"]);
  });

  it("turns between left, 3/4 and right and stops at the ends", () => {
    const all = availableViews(weapon);
    expect(turn("hand", 1, all)).toBe("angle");
    expect(turn("angle", 1, all)).toBe("right");
    expect(turn("right", 1, all)).toBe("right");
    expect(turn("angle", -1, all)).toBe("left");
    expect(turn("left", -1, all)).toBe("left");
  });

  it("inspect goes from the hand around the item and back", () => {
    expect(inspectSequence(availableViews(weapon))).toEqual(["hand", "angle", "left", "right", "angle", "hand"]);
    expect(inspectSequence(availableViews(gloves))).toEqual(["angle", "left", "right", "angle"]);
  });

  it("formats the float with a decimal comma", () => {
    expect(formatFloat(0.48049744963645935)).toBe("0,480497");
  });
});
