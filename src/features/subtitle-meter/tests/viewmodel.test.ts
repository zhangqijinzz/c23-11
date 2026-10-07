import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
import { readTextFile } from "../services/fileService";
import { downloadSubtitles } from "../services/exportService";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import { projectRepository } from "../repositories/projectRepository";
import type { SubtitleCue } from "../models";
vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(
    async () => "1\n00:00:01,000 --> 00:00:03,000\nOriginal caption",
  ),
}));
vi.mock("../repositories/projectRepository", () => ({
  projectRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
  },
}));
vi.mock("../services/exportService", () => ({ downloadSubtitles: vi.fn() }));
describe("SubtitleMeterViewModel", () => {
  let vm: SubtitleMeterViewModel;
  beforeEach(() => {
    vm = new SubtitleMeterViewModel();
    vi.clearAllMocks();
    vi.mocked(readTextFile).mockResolvedValue(
      "1\n00:00:01,000 --> 00:00:03,000\nOriginal caption",
    );
  });
  it("imports, edits, rechecks, snapshots, and exports", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    expect(vm.state.phase).toBe("ready");
    const cue = vm.state.project!.cues[0];
    await vm.editCue(cue.id, { text: "Edited" });
    expect(vm.state.project!.cues[0].text).toBe("Edited");
    await vm.saveVersion();
    expect(vm.state.project!.versions).toHaveLength(1);
    await vm.exportFile();
    expect(vm.state.notice).toBe("字幕文件已导出");
  });
  it("keeps a recoverable error when an unsupported import is selected", async () => {
    await vm.importFile(new File(["x"], "clip.txt"));
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("仅支持");
  });
  it("shows a parse failure as a recoverable import error", async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce("not a subtitle block");
    await vm.importFile(new File(["x"], "clip.srt"));
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("缺少时间码");
  });
  it("keeps editing visible immediately and reports export failures", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    const cue = vm.state.project!.cues[0];
    const saving = vm.editCue(cue.id, { text: "Immediate edit" });
    expect(vm.state.project!.cues[0].text).toBe("Immediate edit");
    await saving;
    vi.mocked(downloadSubtitles).mockImplementationOnce(() => {
      throw new Error("download unavailable");
    });
    await vm.exportFile();
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("导出失败");
    expect(vm.state.project!.cues[0].text).toBe("Immediate edit");
  });

  it("keeps list, inspection, overlap message, and export numbers in sync after reordering", async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce(
      [
        "1",
        "00:00:01,000 --> 00:00:04,000",
        "第一条",
        "",
        "2",
        "00:00:05,000 --> 00:00:07,000",
        "第二条",
        "",
        "3",
        "00:00:08,000 --> 00:00:10,000",
        "第三条",
      ].join("\n"),
    );
    await vm.importFile(new File(["x"], "clip.srt"));
    const thirdId = vm.state.project!.cues[2].id;

    // 把靠后的第三条整体前移，插到最前并与第一条重叠
    await vm.editCue(thirdId, { startMs: 0, endMs: 2000 });

    const cues = vm.state.project!.cues;
    // 列表（数组顺序）与每条自身的 index 一致：cue-3 → 第 1 条
    expect(cues.map((c) => c.id)).toEqual(["cue-3", "cue-1", "cue-2"]);
    expect(cues.map((c) => c.index)).toEqual([1, 2, 3]);

    // 检查提示角标编号 == 列表序号
    const issues = vm.state.issues;
    const overlap = issues.find((i) => i.type === "overlap")!;
    expect(overlap.cueId).toBe("cue-1");
    const overlapper = cues.find((c) => c.id === overlap.cueId)!;
    expect(overlap.message).toContain(
      `与第 ${overlapper.index - 1} 条字幕重叠`,
    );
    expect(
      issues
        .filter((i) => i.cueId === "cue-1")
        .every(
          (i) => cues.find((c) => c.id === i.cueId)?.index === overlapper.index,
        ),
    ).toBe(true);

    // 导出 SRT 的条目序号必须与界面 index 一致
    const exported = formatSubtitles(cues, "srt");
    const srtNumbers = exported
      .split("\n\n")
      .map((block) => Number(block.split("\n")[0]));
    expect(srtNumbers).toEqual(cues.map((c) => c.index));
    expect(exported.split("\n\n")[0]).toContain("第三条");
  });

  it("restores the numbering as it was when the snapshot was taken", async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce(
      [
        "1",
        "00:00:01,000 --> 00:00:03,000",
        "第一条",
        "",
        "2",
        "00:00:04,000 --> 00:00:06,000",
        "第二条",
      ].join("\n"),
    );
    await vm.importFile(new File(["x"], "clip.srt"));
    await vm.saveVersion();
    const snapshotId = vm.state.project!.versions[0].id;
    expect(
      vm.state.project!.versions[0].cues.map((c: SubtitleCue) => c.index),
    ).toEqual([1, 2]);

    // 第二条前移成第一条
    const secondId = vm.state.project!.cues[1].id;
    await vm.editCue(secondId, { startMs: 0, endMs: 900 });
    expect(vm.state.project!.cues.map((c) => c.id)).toEqual(["cue-2", "cue-1"]);
    expect(vm.state.project!.cues.map((c) => c.index)).toEqual([1, 2]);

    // 回退：顺序与编号都回到快照当时（cue-1 又是第 1 条）
    await vm.restoreVersion(snapshotId);
    const restored = vm.state.project!.cues;
    expect(restored.map((c) => c.id)).toEqual(["cue-1", "cue-2"]);
    expect(restored.map((c) => c.index)).toEqual([1, 2]);
    expect(restored[0].startMs).toBe(1000);
  });

  it("migrates legacy persisted projects whose stored indices are stale", async () => {
    // 旧库里数组顺序与 index 都是按导入时冻结的，且时间已被改乱
    vi.mocked(projectRepository.load).mockResolvedValueOnce({
      id: "subtitle-meter.current.v1",
      name: "old.srt",
      format: "srt",
      cues: [
        { id: "cue-1", index: 1, startMs: 8000, endMs: 9000, text: "旧一" },
        { id: "cue-2", index: 2, startMs: 0, endMs: 1000, text: "旧二" },
      ],
      updatedAt: 1,
      versions: [
        {
          id: "v-1",
          label: "快照 1",
          savedAt: 1,
          cues: [
            { id: "cue-1", index: 1, startMs: 5000, endMs: 6000, text: "旧一" },
            { id: "cue-2", index: 2, startMs: 1000, endMs: 2000, text: "旧二" },
          ],
        },
      ],
    });
    await vm.restore();
    const cues = vm.state.project!.cues;
    expect(cues.map((c) => c.id)).toEqual(["cue-2", "cue-1"]);
    expect(cues.map((c) => c.index)).toEqual([1, 2]);
    // 历史快照同样被迁移，回退后编号自洽
    await vm.restoreVersion("v-1");
    expect(vm.state.project!.cues.map((c) => c.index)).toEqual([1, 2]);
    expect(vm.state.project!.cues[0].id).toBe("cue-2");
  });
});
