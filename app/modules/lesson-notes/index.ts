import { noteDraft, type NoteDraft } from "./lib/note-draft";

export type { NoteDraft, NoteDraftStatus } from "./lib/note-draft";

/**
 * Where the Student's Note draft stands against the Note they last saved:
 * whether it can be saved, and how much room is left.
 */
export function describeNoteDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  return noteDraft(draft, savedBody);
}
