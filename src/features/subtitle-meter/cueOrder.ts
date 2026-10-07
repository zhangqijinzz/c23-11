import type { SubtitleCue } from "./models";
/**
 * 全应用统一的条目排序规则：按开始时间升序；开始时间相同按结束时间升序；
 * 起止时间完全相同则按当前编号升序。编辑、检查、快照与导出共用这一套
 * 顺序，保证同一份字幕列表在任何环节都有确定的排列。
 */
export function compareCues(a: SubtitleCue, b: SubtitleCue): number {
  return a.startMs - b.startMs || a.endMs - b.endMs || a.index - b.index;
}
/**
 * 按统一规则排序并从 1 重新编号，让 cue.index 始终等于该条目在当前
 * 时间顺序下的位置。界面列表、检查提示与导出文件因此使用同一套编号；
 * 快照中保存的 cues 恢复后重新规范化，编号也会回到快照时的样子。
 */
export function normalizeCueOrder(cues: SubtitleCue[]): SubtitleCue[] {
  return [...cues]
    .sort(compareCues)
    .map((cue, position) => ({ ...cue, index: position + 1 }));
}
