import { describe, expect, it } from "vitest";
import { compareCues, normalizeCues } from "../ordering";
import type { SubtitleCue } from "../models";

const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text = "x",
  index = 0,
): SubtitleCue => ({ id, index, startMs, endMs, text });

describe("normalizeCues canonical ordering", () => {
  it("renumbers shuffled cues by start time and keeps stable ids", () => {
    const ordered = normalizeCues([
      cue("cue-3", 5000, 6000),
      cue("cue-1", 0, 1000),
      cue("cue-2", 2000, 3000),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(["cue-1", "cue-2", "cue-3"]);
    expect(ordered.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it("has a deterministic order when start times are identical", () => {
    const sameStart = [
      cue("cue-2", 1000, 3000),
      cue("cue-1", 1000, 2000),
      cue("cue-3", 1000, 2500),
    ];
    // 开始相同 → 结束时间升序
    expect(normalizeCues(sameStart).map((c) => c.id)).toEqual([
      "cue-1",
      "cue-3",
      "cue-2",
    ]);
    const identical = [cue("cue-9", 1000, 2000), cue("cue-1", 1000, 2000)];
    // 开始与结束都相同 → 稳定 id（导入顺序）决胜
    expect(normalizeCues(identical).map((c) => c.id)).toEqual([
      "cue-1",
      "cue-9",
    ]);
    expect(
      compareCues(cue("cue-1", 1000, 2000), cue("cue-1", 1000, 2000)),
    ).toBe(0);
  });

  it("is idempotent so re-normalizing a snapshot restores its numbering", () => {
    const once = normalizeCues([
      cue("cue-2", 0, 1000),
      cue("cue-1", 2000, 3000),
    ]);
    expect(normalizeCues(once)).toEqual(once);
  });
});
