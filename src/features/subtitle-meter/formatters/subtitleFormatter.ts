import { compareCues } from "../cueOrder";
import type { Format, SubtitleCue } from "../models";
import { formatTimestamp } from "../parsers/timecode";
export function formatSubtitles(cues: SubtitleCue[], format: Format): string {
  const body = [...cues]
    .sort(compareCues)
    .map(
      (cue, i) =>
        `${i + 1}\n${formatTimestamp(cue.startMs, format)} --> ${formatTimestamp(cue.endMs, format)}\n${cue.text}`,
    )
    .join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}
