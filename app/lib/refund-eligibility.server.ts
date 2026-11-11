// The database lookups behind Refund Eligibility. See GLOSSARY.md.

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  LessonProgressStatus,
  RefundStatus,
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
} from "~/db/schema";
import {
  COMPLETION_LIMIT,
  WATCH_LIMIT_SECONDS,
  getRefundAmount,
  isWithinRefundWindow,
  lastDayOfRefundWindow,
} from "./refund-eligibility";

/** Whether the Purchase has a Refund Request with the given status. */
export function hasRefundRequest(purchaseId: number, status: RefundStatus) {
  const request = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(and(eq(refunds.purchaseId, purchaseId), eq(refunds.status, status)))
    .get();
  return request !== undefined;
}

/**
 * Watched Time, in seconds: the furthest point reached in each lesson, added
 * up across the given lessons. Skipping ahead counts as watching.
 */
export function getWatchedSeconds(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

/** Whether any team seat bought with the Purchase has been redeemed. */
function hasClaimedSeat(purchaseId: number) {
  const seat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();
  return seat !== undefined;
}

export function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();
  return result?.count ?? 0;
}

export function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

/** Why a learner may not raise a Refund Request right now. */
export type RefundIneligibility =
  | "no-purchase"
  | "open-request"
  | "refunded"
  | "claimed-seat"
  | "window-closed"
  | "watch-limit"
  | "completion-limit";

export type EligibleForRefund = {
  eligible: true;
  purchase: typeof purchases.$inferSelect;
  refundAmount: number;
  lastDayOfRefundWindow: string;
};

export type RefundEligibility =
  EligibleForRefund | { eligible: false; reason: RefundIneligibility };

/**
 * Refund Eligibility for the learner's latest Purchase of the course: the
 * single place every rule is checked, so the course page and the refund action
 * cannot disagree.
 */
export function getRefundEligibility(
  userId: number,
  course: { id: number; price: number },
  now: Date = new Date()
): RefundEligibility {
  const purchase = getLatestPurchase(userId, course.id);

  if (!purchase) return { eligible: false, reason: "no-purchase" };
  if (hasRefundRequest(purchase.id, RefundStatus.Open)) {
    return { eligible: false, reason: "open-request" };
  }
  if (hasRefundRequest(purchase.id, RefundStatus.Approved)) {
    return { eligible: false, reason: "refunded" };
  }
  if (hasClaimedSeat(purchase.id)) {
    return { eligible: false, reason: "claimed-seat" };
  }
  if (!isWithinRefundWindow(purchase.createdAt, now)) {
    return { eligible: false, reason: "window-closed" };
  }

  const lessonIds = getLessonIdsForCourse(course.id);

  if (getWatchedSeconds(userId, lessonIds) >= WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "watch-limit" };
  }

  // A course with no lessons has no Completion Limit.
  if (
    lessonIds.length > 0 &&
    getCompletedLessonCount(userId, lessonIds) / lessonIds.length >=
      COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "completion-limit" };
  }

  return {
    eligible: true,
    purchase,
    refundAmount: getRefundAmount(purchase, course),
    lastDayOfRefundWindow: lastDayOfRefundWindow(purchase.createdAt),
  };
}
