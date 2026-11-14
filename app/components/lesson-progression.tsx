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

  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${courseSlug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, courseSlug, navigate]);

  return (
    <div className="mb-8">
      {isCompleted ? (
        <CompletedBanner courseSlug={courseSlug} nextLesson={nextLesson} />
      ) : (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="mark-complete" />
          <Button disabled={isMarking}>
            <MarkCompleteLabel isMarking={isMarking} nextLesson={nextLesson} />
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
}

function CompletedBanner({
  courseSlug,
  nextLesson,
}: {
  courseSlug: string;
  nextLesson: LessonLink | null;
}) {
  return (
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
  );
}

function MarkCompleteLabel({
  isMarking,
  nextLesson,
}: {
  isMarking: boolean;
  nextLesson: LessonLink | null;
}) {
  if (!nextLesson) {
    return (
      <>
        <CheckCircle2 className="mr-2 size-4" />
        {isMarking ? "Marking..." : "Mark as Complete"}
      </>
    );
  }
  if (isMarking) return <>Completing...</>;
  return (
    <>
      Up next: {nextLesson.title}
      <ChevronRight className="ml-1 size-4" />
    </>
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
        <PagerLink
          to={`/courses/${courseSlug}/lessons/${prevLesson.id}`}
          label="Previous"
          title={prevLesson.title}
          direction="back"
        />
      ) : (
        <div />
      )}

      {nextLesson ? (
        <PagerLink
          to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}
          label="Next"
          title={nextLesson.title}
          direction="forward"
          className="text-right"
        />
      ) : (
        <PagerLink
          to={`/courses/${courseSlug}`}
          label="Back to"
          title={courseTitle}
          direction="forward"
        />
      )}
    </div>
  );
}

function PagerLink({
  to,
  label,
  title,
  direction,
  className = "",
}: {
  to: string;
  label: string;
  title: string;
  direction: "back" | "forward";
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground ${className}`}
    >
      {direction === "back" && <ChevronLeft className="size-4" />}
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{title}</div>
      </div>
      {direction === "forward" && <ChevronRight className="size-4" />}
    </Link>
  );
}
