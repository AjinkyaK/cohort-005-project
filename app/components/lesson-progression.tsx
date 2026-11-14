import { useEffect } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";

type LessonLink = { id: number; title: string };

/** Mark the Lesson complete, then move on to the next one. */
export function LessonCompletion({
  lessonId,
  courseSlug,
  completed,
  nextLesson,
}: {
  lessonId: number;
  courseSlug: string;
  completed: boolean;
  nextLesson: LessonLink | null;
}) {
  const fetcher = useFetcher({ key: `mark-complete-${lessonId}` });
  const navigate = useNavigate();

  const isMarking =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "mark-complete";

  const justCompleted = fetcher.data?.success;

  const isCompleted = completed || justCompleted;

  // Navigate to next lesson after marking complete
  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${courseSlug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, courseSlug, navigate]);

  return (
    <div className="mb-8">
      {isCompleted ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="size-5" />
            <span className="font-medium">Lesson completed</span>
          </div>
          {nextLesson && (
            <Link to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}>
              <Button variant="outline" size="sm">
                Up next: {nextLesson.title}
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </Link>
          )}
        </div>
      ) : nextLesson ? (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="mark-complete" />
          <Button disabled={isMarking}>
            {isMarking ? (
              "Completing..."
            ) : (
              <>
                Up next: {nextLesson.title}
                <ChevronRight className="ml-1 size-4" />
              </>
            )}
          </Button>
        </fetcher.Form>
      ) : (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="mark-complete" />
          <Button disabled={isMarking}>
            <CheckCircle2 className="mr-2 size-4" />
            {isMarking ? "Marking..." : "Mark as Complete"}
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
}

export function LessonPager({
  courseSlug,
  courseTitle,
  prevLesson,
  nextLesson,
}: {
  courseSlug: string;
  courseTitle: string;
  prevLesson: LessonLink | null;
  nextLesson: LessonLink | null;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prevLesson ? (
        <Link
          to={`/courses/${courseSlug}/lessons/${prevLesson.id}`}
          className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          <div>
            <div className="text-xs text-muted-foreground">Previous</div>
            <div className="font-medium text-foreground">
              {prevLesson.title}
            </div>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {nextLesson ? (
        <Link
          to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}
          className="flex items-center gap-2 text-right text-sm hover:text-foreground text-muted-foreground"
        >
          <div>
            <div className="text-xs text-muted-foreground">Next</div>
            <div className="font-medium text-foreground">
              {nextLesson.title}
            </div>
          </div>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <Link
          to={`/courses/${courseSlug}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <div>
            <div className="text-xs text-muted-foreground">Back to</div>
            <div className="font-medium text-foreground">{courseTitle}</div>
          </div>
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
