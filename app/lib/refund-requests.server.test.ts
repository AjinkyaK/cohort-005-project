import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  getOpenRefundRequests,
  getRefundRequestsForLearner,
} from "./refund-requests.server";
import {
  getCompletedLessonCount,
  getRefundEligibility,
  getWatchedSeconds,
} from "./refund-eligibility.server";

const holder = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof createTestDb>,
}));

vi.mock("~/db", () => ({
  get db() {
    return holder.db;
  },
}));

let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  holder.db = createTestDb();
  base = seedBaseData(holder.db);
});

function buy(
  userId: number,
  overrides: Partial<typeof schema.purchases.$inferInsert> = {}
) {
  return holder.db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 4900,
      country: "US",
      createdAt: "2026-03-01T12:00:00.000Z",
      ...overrides,
    })
    .returning()
    .get();
}

function requestRefund(
  purchaseId: number,
  overrides: Partial<typeof schema.refunds.$inferInsert> = {}
) {
  return holder.db
    .insert(schema.refunds)
    .values({
      purchaseId,
      reason: "It was not what I expected.",
      requestedAt: "2026-03-03T09:00:00.000Z",
      ...overrides,
    })
    .returning()
    .get();
}

function addLearner(name: string) {
  return holder.db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function addLessons(courseId: number, count: number): number[] {
  const mod = holder.db
    .insert(schema.modules)
    .values({ courseId, title: "Module 1", position: 1 })
    .returning()
    .get();

  return Array.from(
    { length: count },
    (_, i) =>
      holder.db
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: `Lesson ${i + 1}`, position: i + 1 })
        .returning()
        .get().id
  );
}

function watch(userId: number, lessonId: number, positionSeconds: number) {
  holder.db
    .insert(schema.videoWatchEvents)
    .values({ userId, lessonId, eventType: "progress", positionSeconds })
    .run();
}

function complete(userId: number, lessonId: number) {
  holder.db
    .insert(schema.lessonProgress)
    .values({
      userId,
      lessonId,
      status: schema.LessonProgressStatus.Completed,
    })
    .run();
}

function addPlatformAdmin() {
  return holder.db
    .insert(schema.users)
    .values({
      name: "Pat Admin",
      email: "pat@example.com",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();
}

describe("getOpenRefundRequests", () => {
  it("lists Open Refund Requests and leaves out Approved and Declined ones", () => {
    const open = requestRefund(buy(base.user.id).id, {
      reason: "Too advanced for me.",
    });
    requestRefund(buy(addLearner("Bea").id).id, {
      status: schema.RefundStatus.Approved,
    });
    requestRefund(buy(addLearner("Cal").id).id, {
      status: schema.RefundStatus.Declined,
    });

    const requests = getOpenRefundRequests();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: open.id,
      reason: "Too advanced for me.",
      requestedAt: "2026-03-03T09:00:00.000Z",
      buyer: { id: base.user.id, name: "Test User" },
      course: { id: base.course.id, title: "Test Course" },
      purchasedAt: "2026-03-01T12:00:00.000Z",
      amountPaid: 4900,
    });
  });

  it("lists the oldest request first", () => {
    const newer = requestRefund(buy(base.user.id).id, {
      requestedAt: "2026-03-05T09:00:00.000Z",
    });
    const older = requestRefund(buy(addLearner("Bea").id).id, {
      requestedAt: "2026-03-02T09:00:00.000Z",
    });

    expect(getOpenRefundRequests().map((r) => r.id)).toEqual([
      older.id,
      newer.id,
    ]);
  });

  it("reports each learner's current Watched Time and lessons completed on the course", () => {
    const bea = addLearner("Bea");
    const [lesson1, lesson2, lesson3, lesson4] = addLessons(base.course.id, 4);

    const otherCourse = holder.db
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Another course",
        salesCopy: "## Other Course",
        status: schema.CourseStatus.Published,
        instructorId: base.instructor.id,
        categoryId: base.category.id,
      })
      .returning()
      .get();
    const [otherLesson] = addLessons(otherCourse.id, 1);

    // Test User: furthest points of 300s and 120s, and two lessons completed.
    watch(base.user.id, lesson1, 100);
    watch(base.user.id, lesson1, 300);
    watch(base.user.id, lesson2, 120);
    complete(base.user.id, lesson1);
    complete(base.user.id, lesson2);
    // Their progress on another course does not count.
    watch(base.user.id, otherLesson, 5000);
    complete(base.user.id, otherLesson);

    // Bea: her own progress, not Test User's.
    watch(bea.id, lesson3, 60);
    complete(bea.id, lesson4);

    requestRefund(buy(base.user.id).id, {
      requestedAt: "2026-03-02T09:00:00.000Z",
    });
    requestRefund(buy(bea.id).id, { requestedAt: "2026-03-03T09:00:00.000Z" });

    const [first, second] = getOpenRefundRequests();

    expect(first).toMatchObject({
      buyer: { id: base.user.id },
      progress: { watchedSeconds: 420, completedLessons: 2, totalLessons: 4 },
    });
    expect(second).toMatchObject({
      buyer: { id: bea.id },
      progress: { watchedSeconds: 60, completedLessons: 1, totalLessons: 4 },
    });
  });

  it("reports progress made after the request was raised", () => {
    const [lesson1] = addLessons(base.course.id, 2);
    requestRefund(buy(base.user.id).id);

    watch(base.user.id, lesson1, 900);
    complete(base.user.id, lesson1);

    expect(getOpenRefundRequests()[0].progress).toEqual({
      watchedSeconds: 900,
      completedLessons: 1,
      totalLessons: 2,
    });
  });

  describe("Purchase kind and Refund Amount", () => {
    beforeEach(() => {
      // Repriced since the purchases below were made.
      holder.db
        .update(schema.courses)
        .set({ price: 7900 })
        .where(eq(schema.courses.id, base.course.id))
        .run();
    });

    it("quotes the current list price for a full-price Individual Purchase", () => {
      requestRefund(buy(base.user.id, { amountPaid: 4900, country: "US" }).id);

      expect(getOpenRefundRequests()[0]).toMatchObject({
        purchaseKind: "individual",
        amountPaid: 4900,
        refundAmount: 7900,
      });
    });

    it("quotes what was paid for an Individual Purchase at a purchasing-power discount", () => {
      requestRefund(buy(base.user.id, { amountPaid: 2370, country: "IN" }).id);

      expect(getOpenRefundRequests()[0]).toMatchObject({
        purchaseKind: "individual",
        refundAmount: 2370,
      });
    });

    it("labels a Team Licence and quotes what was paid for it", () => {
      const purchase = buy(base.user.id, { amountPaid: 14700, country: "US" });
      const team = holder.db.insert(schema.teams).values({}).returning().get();
      for (const code of ["SEAT-1", "SEAT-2", "SEAT-3"]) {
        holder.db
          .insert(schema.coupons)
          .values({
            teamId: team.id,
            courseId: base.course.id,
            purchaseId: purchase.id,
            code,
          })
          .run();
      }
      requestRefund(purchase.id);

      const requests = getOpenRefundRequests();

      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        purchaseKind: "team-licence",
        amountPaid: 14700,
        refundAmount: 14700,
      });
    });

    it("reports no progress for a Team Licence, since the buyer's own viewing is not a sign the team used it", () => {
      const [lesson1] = addLessons(base.course.id, 2);
      const purchase = buy(base.user.id, { amountPaid: 9800 });
      const team = holder.db.insert(schema.teams).values({}).returning().get();
      holder.db
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          purchaseId: purchase.id,
          code: "SEAT-1",
        })
        .run();
      // The Team Admin's own viewing, as a learner on another Purchase.
      watch(base.user.id, lesson1, 900);
      requestRefund(purchase.id);

      expect(getOpenRefundRequests()[0].progress).toBeNull();
    });
  });
});

describe("declineRefundRequest", () => {
  it("declines an Open request, recording when and by whom, and refunds nothing", () => {
    const admin = addPlatformAdmin();
    const request = requestRefund(buy(base.user.id).id);
    const now = new Date("2026-03-04T10:00:00.000Z");

    const result = declineRefundRequest(request.id, admin.id, now);

    expect(result).toMatchObject({
      ok: true,
      refundRequest: {
        id: request.id,
        status: schema.RefundStatus.Declined,
        resolvedAt: "2026-03-04T10:00:00.000Z",
        resolvedByUserId: admin.id,
        amountRefunded: null,
        paymentTransferStatus: null,
      },
    });
  });

  it.each([schema.RefundStatus.Approved, schema.RefundStatus.Declined])(
    "refuses to decline a request that is already %s, and changes nothing",
    (status) => {
      const admin = addPlatformAdmin();
      const request = requestRefund(buy(base.user.id).id, {
        status,
        resolvedAt: "2026-03-03T12:00:00.000Z",
        resolvedByUserId: base.instructor.id,
      });

      const result = declineRefundRequest(request.id, admin.id);

      expect(result).toEqual({ ok: false, reason: "already-resolved" });
      const after = holder.db
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, request.id))
        .get();
      expect(after).toEqual(request);
    }
  );

  it("refuses a Refund Request that does not exist", () => {
    const admin = addPlatformAdmin();

    expect(declineRefundRequest(999, admin.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("leaves the learner's Enrollment in place", () => {
    const admin = addPlatformAdmin();
    holder.db
      .insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    const request = requestRefund(buy(base.user.id).id);

    declineRefundRequest(request.id, admin.id);

    const enrollment = holder.db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, base.user.id))
      .get();
    expect(enrollment).toMatchObject({ courseId: base.course.id });
  });

  it("takes the request off the Open list", () => {
    const admin = addPlatformAdmin();
    const declined = requestRefund(buy(base.user.id).id);
    const stillOpen = requestRefund(buy(addLearner("Bea").id).id);

    declineRefundRequest(declined.id, admin.id);

    expect(getOpenRefundRequests().map((r) => r.id)).toEqual([stillOpen.id]);
  });
});

describe("approveRefundRequest", () => {
  it("approves an Open request, recording the Amount Refunded, when and by whom", () => {
    const admin = addPlatformAdmin();
    const request = requestRefund(buy(base.user.id).id);
    const now = new Date("2026-03-04T10:00:00.000Z");

    const result = approveRefundRequest(request.id, admin.id, 4500, now);

    expect(result).toMatchObject({
      ok: true,
      refundRequest: {
        id: request.id,
        status: schema.RefundStatus.Approved,
        amountRefunded: 4500,
        resolvedAt: "2026-03-04T10:00:00.000Z",
        resolvedByUserId: admin.id,
        paymentTransferStatus: null,
      },
    });
  });

  it.each([schema.RefundStatus.Approved, schema.RefundStatus.Declined])(
    "refuses to approve a request that is already %s, and changes nothing",
    (status) => {
      const admin = addPlatformAdmin();
      const request = requestRefund(buy(base.user.id).id, {
        status,
        resolvedAt: "2026-03-03T12:00:00.000Z",
        resolvedByUserId: base.instructor.id,
      });

      const result = approveRefundRequest(request.id, admin.id, 4900);

      expect(result).toEqual({ ok: false, reason: "already-resolved" });
      const after = holder.db
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, request.id))
        .get();
      expect(after).toEqual(request);
    }
  );

  it("refuses a Refund Request that does not exist", () => {
    const admin = addPlatformAdmin();

    expect(approveRefundRequest(999, admin.id, 4900)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses a request on a Team Licence, and leaves it Open", () => {
    const admin = addPlatformAdmin();
    const purchase = buy(base.user.id);
    const team = holder.db.insert(schema.teams).values({}).returning().get();
    holder.db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-1",
        purchaseId: purchase.id,
      })
      .run();
    const request = requestRefund(purchase.id);

    const result = approveRefundRequest(request.id, admin.id, 4900);

    expect(result).toEqual({ ok: false, reason: "team-licence" });
    expect(getOpenRefundRequests().map((r) => r.id)).toEqual([request.id]);
  });

  it("reports an already-resolved Team Licence request as already resolved", () => {
    const admin = addPlatformAdmin();
    const purchase = buy(base.user.id);
    const team = holder.db.insert(schema.teams).values({}).returning().get();
    holder.db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-1",
        purchaseId: purchase.id,
      })
      .run();
    const request = requestRefund(purchase.id, {
      status: schema.RefundStatus.Declined,
    });

    expect(approveRefundRequest(request.id, admin.id, 4900)).toEqual({
      ok: false,
      reason: "already-resolved",
    });
  });

  describe("the learner's Enrollment", () => {
    function enroll(userId: number, courseId = base.course.id) {
      holder.db.insert(schema.enrollments).values({ userId, courseId }).run();
    }

    function enrolledCourseIds(userId: number) {
      return holder.db
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, userId))
        .all()
        .map((e) => e.courseId);
    }

    it("ends the learner's Enrollment in the course, and nobody else's", () => {
      const admin = addPlatformAdmin();
      const bea = addLearner("Bea");
      const otherCourse = holder.db
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          salesCopy: "Sales copy.",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();
      enroll(base.user.id);
      enroll(base.user.id, otherCourse.id);
      enroll(bea.id);
      const request = requestRefund(buy(base.user.id).id);

      approveRefundRequest(request.id, admin.id, 4900);

      expect(enrolledCourseIds(base.user.id)).toEqual([otherCourse.id]);
      expect(enrolledCourseIds(bea.id)).toEqual([base.course.id]);
    });

    it("leaves the Enrollment alone if the learner also holds a Claimed Seat on the course", () => {
      const admin = addPlatformAdmin();
      const teamAdmin = addLearner("Tess");
      const team = holder.db.insert(schema.teams).values({}).returning().get();
      holder.db
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code: "SEAT-1",
          purchaseId: buy(teamAdmin.id).id,
          redeemedByUserId: base.user.id,
          redeemedAt: "2026-03-02T12:00:00.000Z",
        })
        .run();
      enroll(base.user.id);
      const request = requestRefund(buy(base.user.id).id);

      const result = approveRefundRequest(request.id, admin.id, 4900);

      expect(result.ok).toBe(true);
      expect(enrolledCourseIds(base.user.id)).toEqual([base.course.id]);
    });
  });

  it("makes the Purchase a Refunded Purchase, and lets the learner buy the course again", () => {
    const admin = addPlatformAdmin();
    const course = { id: base.course.id, price: base.course.price };
    const request = requestRefund(buy(base.user.id).id);

    approveRefundRequest(request.id, admin.id, 4900);

    expect(
      getRefundEligibility(base.user.id, course, new Date("2026-03-05T12:00:00.000Z"))
    ).toEqual({ eligible: false, reason: "refunded" });

    const again = buy(base.user.id, { createdAt: "2026-03-10T12:00:00.000Z" });

    expect(
      getRefundEligibility(base.user.id, course, new Date("2026-03-11T12:00:00.000Z"))
    ).toMatchObject({ eligible: true, purchase: { id: again.id } });
  });

  it("keeps the learner's lesson progress, Watched Time and quiz attempts", () => {
    const admin = addPlatformAdmin();
    const lessonIds = addLessons(base.course.id, 2);
    watch(base.user.id, lessonIds[0], 600);
    complete(base.user.id, lessonIds[0]);
    const quiz = holder.db
      .insert(schema.quizzes)
      .values({ lessonId: lessonIds[0], title: "Quiz", passingScore: 0.7 })
      .returning()
      .get();
    holder.db
      .insert(schema.quizAttempts)
      .values({ userId: base.user.id, quizId: quiz.id, score: 0.8, passed: true })
      .run();
    const request = requestRefund(buy(base.user.id).id);

    approveRefundRequest(request.id, admin.id, 4900);

    expect(getWatchedSeconds(base.user.id, lessonIds)).toBe(600);
    expect(getCompletedLessonCount(base.user.id, lessonIds)).toBe(1);
    expect(
      holder.db
        .select()
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.userId, base.user.id))
        .all()
    ).toHaveLength(1);
  });
});

describe("getRefundRequestsForLearner", () => {
  it("lists the learner's requests with their status, newest first, and nobody else's", () => {
    const declined = requestRefund(buy(base.user.id).id, {
      status: schema.RefundStatus.Declined,
      requestedAt: "2026-03-02T09:00:00.000Z",
      resolvedAt: "2026-03-04T10:00:00.000Z",
    });
    const open = requestRefund(buy(base.user.id).id, {
      requestedAt: "2026-03-06T09:00:00.000Z",
    });
    requestRefund(buy(addLearner("Bea").id).id);

    const requests = getRefundRequestsForLearner(base.user.id);

    expect(requests).toEqual([
      expect.objectContaining({
        id: open.id,
        status: schema.RefundStatus.Open,
        resolvedAt: null,
        courseTitle: "Test Course",
        courseSlug: "test-course",
        amountPaid: 4900,
      }),
      expect.objectContaining({
        id: declined.id,
        status: schema.RefundStatus.Declined,
        resolvedAt: "2026-03-04T10:00:00.000Z",
      }),
    ]);
  });
});
