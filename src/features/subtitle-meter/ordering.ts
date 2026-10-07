import type { SubtitleCue } from "./models";

const idTailNumber = (id: string): number | null => {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
};

/**
 * 全局唯一的字幕定序规则：
 * 开始时间升序 → 结束时间升序 → 稳定 id 升序（导入顺序）。
 * 编辑、检查、快照、导出都必须使用这一套顺序，
 * 保证同一条字幕在任何界面、任何产物里的序号一致；
 * 时间完全相同时顺序也由此确定，不会随排序实现波动。
 */
export function compareCues(a: SubtitleCue, b: SubtitleCue): number {
  const aTail = idTailNumber(a.id),
    bTail = idTailNumber(b.id);
  return (
    a.startMs - b.startMs ||
    a.endMs - b.endMs ||
    (aTail ?? Number.POSITIVE_INFINITY) - (bTail ?? Number.POSITIVE_INFINITY) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * 按统一规则排好序并重新编号的字幕副本。
 * id 保持不变（选中态、快照、问题关联均依赖它），
 * index 始终等于当前时间序中的位置（从 1 开始），
 * 即界面列表、检查提示与导出文件共用的“条目序号”。
 */
export function normalizeCues(cues: readonly SubtitleCue[]): SubtitleCue[] {
  return [...cues]
    .sort(compareCues)
    .map((cue, position) => ({ ...cue, index: position + 1 }));
}
