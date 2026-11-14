import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "unsaved" | "saved" | "over-limit";

export type NoteDraft = {
  length: number;
  status: NoteDraftStatus;
  canSave: boolean;
};

// Saving trims the body (see saveNote), so the draft is measured and compared
// trimmed: trailing whitespace alone is not an unsaved change.
export function noteDraft(draft: string, savedBody: string | null): NoteDraft {
  const body = draft.trim();
  const length = body.length;
  const status = draftStatus(body, savedBody, length > MAX_NOTE_LENGTH);

  return {
    length,
    status,
    canSave: status === "unsaved" && length > 0,
  };
}

function draftStatus(
  body: string,
  savedBody: string | null,
  overLimit: boolean
): NoteDraftStatus {
  if (overLimit) return "over-limit";
  if (body === (savedBody ?? "")) return savedBody === null ? "empty" : "saved";
  return "unsaved";
}
