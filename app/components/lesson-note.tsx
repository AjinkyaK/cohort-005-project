import { useState } from "react";
import { useFetcher } from "react-router";
import { Check, Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import {
  describeNoteDraft,
  type NoteDraft,
  type NoteDraftStatus,
} from "~/modules/lesson-notes";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { cn, formatRelativeTime } from "~/lib/utils";

/** The Student's private Note on the Lesson, styled as a sibling of the Discussion card. */
export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.state === "idle" ? fetcher.data?.error : undefined;
  const draft = describeNoteDraft(body, note?.body ?? null);

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <NoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Key ideas, questions to come back to, code to try..."
            aria-label="Your notes"
            aria-invalid={draft.status === "over-limit" || undefined}
            className="min-h-28 resize-y"
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !draft.canSave}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            <NoteStatus
              error={error}
              status={draft.status}
              updatedAt={note?.updatedAt}
            />
            <NoteLength draft={draft} />
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteLength({ draft }: { draft: NoteDraft }) {
  return (
    <span
      className={cn(
        "ml-auto text-xs tabular-nums",
        draft.status === "over-limit"
          ? "text-destructive"
          : "text-muted-foreground"
      )}
    >
      {draft.length} / {MAX_NOTE_LENGTH}
    </span>
  );
}

function NoteHeader() {
  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Only visible to you
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Jot down what you want to remember from this lesson. Find them all later
        under Saved.
      </p>
    </>
  );
}

function NoteStatus({
  error,
  status,
  updatedAt,
}: {
  error: string | undefined;
  status: NoteDraftStatus;
  updatedAt: string | undefined;
}) {
  if (error) return <span className="text-xs text-destructive">{error}</span>;
  if (status === "over-limit") {
    return (
      <span className="text-xs text-destructive">
        Too long to save. Trim it down a little.
      </span>
    );
  }
  if (status === "unsaved") {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (status === "saved" && updatedAt) {
    return (
      <span
        suppressHydrationWarning
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Check className="size-3.5 text-green-600" />
        Saved {formatRelativeTime(updatedAt)}
      </span>
    );
  }
  return null;
}
