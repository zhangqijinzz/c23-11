import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectIssues } from "../analyzers/issueDetector";
import { normalizeCueOrder } from "../cueOrder";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import type { SubtitleCue } from "../models";
import { parseSubtitles } from "../parsers/subtitleParser";
import { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(
    async () =>
      "1\n00:00:01,000 --> 00:00:02,000\nAlpha\n\n2\n00:00:03,000 --> 00:00:04,000\nBeta\n\n3\n00:00:05,000 --> 00:00:06,000\nGamma",
  ),
}));
vi.mock("../repositories/projectRepository", () => ({
  projectRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
  },
}));
vi.mock("../services/exportService", () => ({ downloadSubtitles: vi.fn() }));
const cue = (
  id: string,
  index: number,
  startMs: number,
  endMs: number,
): SubtitleCue => ({ id, index, startMs, endMs, text: id });
describe("cue ordering and numbering", () => {
  it("orders by start, then end, then current index, and renumbers from 1", () => {
    const ordered = normalizeCueOrder([
      cue("c", 3, 1000, 2000),
      cue("a", 1, 1000, 1500),
      cue("b", 2, 1000, 1500),
      cue("d", 4, 500, 900),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["d", "a", "b", "c"]);
    expect(ordered.map((item) => item.index)).toEqual([1, 2, 3, 4]);
  });
  it("keeps a deterministic order for identical timestamps", () => {
    const cues = [
      cue("a", 1, 1000, 1500),
      cue("b", 2, 1000, 1500),
      cue("c", 3, 1000, 1500),
    ];
    const once = normalizeCueOrder(cues);
    expect(once.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(normalizeCueOrder(once)).toEqual(once);
  });
  it("assigns time-order numbering at import even when the file is unordered", () => {
    const cues = parseSubtitles(
      "1\n00:00:05,000 --> 00:00:06,000\nLate\n\n2\n00:00:01,000 --> 00:00:02,000\nEarly",
      "srt",
    );
    expect(cues.map((item) => item.text)).toEqual(["Early", "Late"]);
    expect(cues.map((item) => item.index)).toEqual([1, 2]);
    expect(formatSubtitles(cues, "srt")).toContain(
      "1\n00:00:01,000 --> 00:00:02,000\nEarly",
    );
  });
  it("references the same numbering in overlap messages as in the cue list", () => {
    const cues = normalizeCueOrder([
      cue("later", 2, 1000, 2000),
      cue("moved", 1, 500, 1500),
    ]);
    const overlap = detectIssues(cues).find(
      (issue) => issue.type === "overlap",
    );
    expect(overlap?.message).toContain("第 1 条");
    expect(cues.find((item) => item.id === overlap?.cueId)?.index).toBe(2);
  });
});
describe("numbering stays consistent across edit, check, snapshot and export", () => {
  let vm: SubtitleMeterViewModel;
  beforeEach(() => {
    vm = new SubtitleMeterViewModel();
  });
  it("renumbers after moving a later cue earlier and restores numbering with the snapshot", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    const gamma = vm.state.project!.cues[2];
    expect(gamma.text).toBe("Gamma");
    await vm.saveVersion();
    await vm.editCue(gamma.id, { startMs: 500, endMs: 1500 });
    const cues = vm.state.project!.cues;
    expect(cues.map((item) => item.text)).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(cues.map((item) => item.index)).toEqual([1, 2, 3]);
    const overlap = vm.state.issues.find((issue) => issue.type === "overlap");
    expect(overlap?.message).toContain("第 1 条");
    const target = cues.find((item) => item.id === overlap?.cueId);
    expect(target?.text).toBe("Alpha");
    expect(target?.index).toBe(2);
    const exported = formatSubtitles(cues, "srt");
    expect(exported).toContain("1\n00:00:00,500 --> 00:00:01,500\nGamma");
    expect(exported).toContain("2\n00:00:01,000 --> 00:00:02,000\nAlpha");
    await vm.restoreVersion(vm.state.project!.versions[0].id);
    const restored = vm.state.project!.cues;
    expect(restored.map((item) => item.text)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(restored.map((item) => item.index)).toEqual([1, 2, 3]);
    expect(restored[2].startMs).toBe(5000);
  });
  it("uses the on-screen numbering as WebVTT cue identifiers on export", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    const gamma = vm.state.project!.cues[2];
    await vm.editCue(gamma.id, { startMs: 500, endMs: 1500 });
    vm.setFormat("vtt");
    const exported = formatSubtitles(vm.state.project!.cues, "vtt");
    expect(exported).toContain("1\n00:00:00.500 --> 00:00:01.500\nGamma");
    expect(exported).not.toContain(gamma.id);
  });
});
