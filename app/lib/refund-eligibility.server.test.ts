import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { getRefundEligibility } from "./refund-eligibility.server";

const holder = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof createTestDb>,
}));

vi.mock("~/db", () => ({
  get db() {
    return holder.db;
  },
}));

// Local-time constructors, because the Refund Window is counted in the
// platform's local time.
function at(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour);
}

const PURCHASED_AT = at(2026, 3, 1);
const NOW = at(2026, 3, 5);

let learnerId: number;
let course: { id: number; price: number };

beforeEach(() => {
  holder.db = createTestDb();
  const base = seedBaseData(holder.db);
  learnerId = base.user.id;
  course = { id: base.course.id, price: 7900 };
});

function buy(overrides: Partial<typeof schema.purchases.$inferInsert> = {}) {
  return holder.db
    .insert(schema.purchases)
    .values({
      userId: learnerId,
      courseId: course.id,
      amountPaid: 7900,
      country: "US",
      createdAt: PURCHASED_AT.toISOString(),
      ...overrides,
    })
    .returning()
    .get();
}

function requestRefund(purchaseId: number, status: schema.RefundStatus) {
  holder.db
    .insert(schema.refunds)
    .values({ purchaseId, status, reason: "It was not what I expected." })
    .run();
}

function addLessons(count: number): number[] {
  const mod = holder.db
    .insert(schema.modules)
    .values({ courseId: course.id, title: "Module 1", position: 1 })
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

function watch(lessonId: number, positionSeconds: number) {
  holder.db
    .insert(schema.videoWatchEvents)
    .values({
      userId: learnerId,
      lessonId,
      eventType: "progress",
      positionSeconds,
    })
    .run();
}

describe("Refund Eligibility", () => {
  it("quotes the Refund Amount and Refund Window for an eligible Purchase", () => {
    const purchase = buy();

    expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
      eligible: true,
      purchase,
      refundAmount: 7900,
      lastDayOfRefundWindow: "2026-03-15",
    });
  });

  it("is not eligible without a Purchase", () => {
    expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
      eligible: false,
      reason: "no-purchase",
    });
  });

  it("is not eligible while the Purchase has an Open Refund Request", () => {
    const purchase = buy();
    requestRefund(purchase.id, schema.RefundStatus.Open);

    expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
      eligible: false,
      reason: "open-request",
    });
  });

  it("is not eligible once the Purchase is a Refunded Purchase", () => {
    const purchase = buy();
    requestRefund(purchase.id, schema.RefundStatus.Approved);

    expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
      eligible: false,
      reason: "refunded",
    });
  });

  it("stays eligible after a Declined Refund Request", () => {
    const purchase = buy();
    requestRefund(purchase.id, schema.RefundStatus.Declined);

    expect(getRefundEligibility(learnerId, course, NOW).eligible).toBe(true);
  });

  it("judges a new Purchase on its own after a Refunded Purchase", () => {
    const refunded = buy();
    requestRefund(refunded.id, schema.RefundStatus.Approved);
    buy({ createdAt: at(2026, 3, 4).toISOString() });

    expect(getRefundEligibility(learnerId, course, NOW).eligible).toBe(true);
  });

  it("is not eligible once the Refund Window has closed", () => {
    buy();

    expect(getRefundEligibility(learnerId, course, at(2026, 3, 16))).toEqual({
      eligible: false,
      reason: "window-closed",
    });
  });

  describe("Watch Limit", () => {
    it("makes a learner with two hours of Watched Time ineligible", () => {
      buy();
      const [first, second] = addLessons(2);
      watch(first, 3600);
      watch(second, 3600);

      expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
        eligible: false,
        reason: "watch-limit",
      });
    });

    it("counts only the furthest point reached in each lesson", () => {
      buy();
      const [lesson] = addLessons(1);
      // Rewatching the same stretch three times is still 50 minutes.
      watch(lesson, 3000);
      watch(lesson, 3000);
      watch(lesson, 3000);

      expect(getRefundEligibility(learnerId, course, NOW).eligible).toBe(true);
    });
  });

  describe("Completion Limit", () => {
    function complete(lessonId: number) {
      holder.db
        .insert(schema.lessonProgress)
        .values({
          userId: learnerId,
          lessonId,
          status: schema.LessonProgressStatus.Completed,
        })
        .run();
    }

    it("makes a learner who has completed half the lessons ineligible", () => {
      buy();
      const [first, second] = addLessons(4);
      complete(first);
      complete(second);

      expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
        eligible: false,
        reason: "completion-limit",
      });
    });

    it("leaves a learner under half the lessons eligible", () => {
      buy();
      const [first] = addLessons(3);
      complete(first);

      expect(getRefundEligibility(learnerId, course, NOW).eligible).toBe(true);
    });

    it("does not count lessons that are only in progress", () => {
      buy();
      const [first, second] = addLessons(3);
      complete(first);
      holder.db
        .insert(schema.lessonProgress)
        .values({
          userId: learnerId,
          lessonId: second,
          status: schema.LessonProgressStatus.InProgress,
        })
        .run();

      expect(getRefundEligibility(learnerId, course, NOW).eligible).toBe(true);
    });
  });

  describe("Claimed Seat", () => {
    function addSeat(
      purchaseId: number,
      code: string,
      redeemedAt: string | null
    ) {
      const team = holder.db.insert(schema.teams).values({}).returning().get();
      holder.db
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: course.id,
          code,
          purchaseId,
          redeemedAt,
        })
        .run();
    }

    it("makes a team Purchase ineligible, even with unclaimed seats left", () => {
      const purchase = buy();
      addSeat(purchase.id, "SEAT-1", NOW.toISOString());
      addSeat(purchase.id, "SEAT-2", null);

      expect(getRefundEligibility(learnerId, course, NOW)).toEqual({
        eligible: false,
        reason: "claimed-seat",
      });
    });

    it("does not block a team Purchase whose seats are all unclaimed", () => {
      const purchase = buy();
      addSeat(purchase.id, "SEAT-1", null);

      expect(getRefundEligibility(learnerId, course, NOW).eligible).toBe(true);
    });
  });
});
