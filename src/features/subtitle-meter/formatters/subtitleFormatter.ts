import type { Format, SubtitleCue } from "../models";
import { normalizeCues } from "../ordering";
import { formatTimestamp } from "../parsers/timecode";
export function formatSubtitles(
  rawCues: readonly SubtitleCue[],
  format: Format,
): string {
  // 统一标准序与编号：SRT 的条目号必须与界面看到的序号一致。
  const cues = normalizeCues(rawCues);
  const body = cues
    .map(
      (cue) =>
        `${format === "srt" ? cue.index : cue.id}\n${formatTimestamp(cue.startMs, format)} --> ${formatTimestamp(cue.endMs, format)}\n${cue.text}`,
    )
    .join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}
