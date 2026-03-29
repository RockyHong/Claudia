import { describe, it, expect } from "vitest";
import { createSFX } from "./sfx.js";

describe("createSFX", () => {
  it("returns no sounds on first broadcast", () => {
    const sfx = createSFX();
    const sounds = sfx.getSoundsForUpdate([
      { id: "s1", state: "busy" },
    ]);
    expect(sounds).toEqual([]);
  });

  it("returns pending sound on state transition to pending", () => {
    const sfx = createSFX();
    sfx.getSoundsForUpdate([{ id: "s1", state: "busy" }]);

    const sounds = sfx.getSoundsForUpdate([{ id: "s1", state: "pending" }]);
    expect(sounds).toEqual(["pending"]);
  });

  it("returns idle sound on state transition to idle", () => {
    const sfx = createSFX();
    sfx.getSoundsForUpdate([{ id: "s1", state: "busy" }]);

    const sounds = sfx.getSoundsForUpdate([{ id: "s1", state: "idle" }]);
    expect(sounds).toEqual(["idle"]);
  });

  it("does not return sound when state unchanged", () => {
    const sfx = createSFX();
    sfx.getSoundsForUpdate([{ id: "s1", state: "busy" }]);

    const sounds = sfx.getSoundsForUpdate([{ id: "s1", state: "busy" }]);
    expect(sounds).toEqual([]);
  });

  it("tracks multiple sessions independently", () => {
    const sfx = createSFX();
    sfx.getSoundsForUpdate([
      { id: "s1", state: "busy" },
      { id: "s2", state: "busy" },
    ]);

    const sounds = sfx.getSoundsForUpdate([
      { id: "s1", state: "pending" },
      { id: "s2", state: "busy" },
    ]);
    expect(sounds).toEqual(["pending"]);
  });

  it("cleans up removed sessions", () => {
    const sfx = createSFX();
    sfx.getSoundsForUpdate([
      { id: "s1", state: "busy" },
      { id: "s2", state: "busy" },
    ]);

    // s1 removed
    sfx.getSoundsForUpdate([{ id: "s2", state: "idle" }]);

    // s1 reappears as new — should not trigger idle (no prev)
    const sounds = sfx.getSoundsForUpdate([
      { id: "s1", state: "idle" },
      { id: "s2", state: "idle" },
    ]);
    // s1 has no prev so idle doesn't fire, s2 unchanged
    expect(sounds).toEqual([]);
  });

  it("does not play idle for brand new sessions", () => {
    const sfx = createSFX();
    sfx.getSoundsForUpdate([]); // first broadcast (empty)

    const sounds = sfx.getSoundsForUpdate([{ id: "s1", state: "idle" }]);
    // No prev state for s1, so idle should not fire
    expect(sounds).toEqual([]);
  });
});
