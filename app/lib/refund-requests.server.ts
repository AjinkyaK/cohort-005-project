// Refund Requests: the Platform Admin resolving them, and the learner seeing their own. See GLOSSARY.md.

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import {
  PaymentTransferStatus,
  RefundStatus,
  coupons,
  courses,
  enrollments,
  purchases,
  refunds,
  users,
} from "~/db/schema";
import { getRefundAmount } from "./refund-eligibility";
import {
  getCompletedLessonCount,
  getLessonIdsForCourse,
  getWatchedSeconds,
  isTeamLicence,
} from "./refund-eligibility.server";
import { holdsClaimedSeat } from "./seats.server";

export type PurchaseKind = "individual" | "team-licence";

export type RefundRequestProgress = {
  watchedSeconds: number;
  completedLessons: number;
  totalLessons: number;
};

/** Every Open Refund Request, oldest first, with what a Platform Admin needs to decide it. */
export function getOpenRefundRequests() {
  const rows = db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      buyer: { id: users.id, name: users.name, email: users.email },
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        price: courses.price,
      },
      purchasedAt: purchases.createdAt,
      amountPaid: purchases.amountPaid,
      country: purchases.country,
      // A Team Licence is a Purchase that bought Seats.
      isTeamLicence: sql<number>`exists (select 1 from ${coupons} where ${coupons.purchaseId} = ${purchases.id})`,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();

  return rows.map(({ isTeamLicence, country, ...row }) => ({
    ...row,
    purchaseKind: (isTeamLicence ? "team-licence" : "individual") as PurchaseKind,
    refundAmount: getRefundAmount(
      { amountPaid: row.amountPaid, country, isTeamLicence: !!isTeamLicence },
      row.course
    ),
    // A Team Licence buyer's own viewing says nothing about whether the team
    // used it (ADR 0002). Otherwise these are live numbers, not a snapshot
    // from when the request was raised (ADR 0003).
    progress: isTeamLicence ? null : getProgress(row.buyer.id, row.course.id),
  }));
}

/** The learner's Watched Time and lessons completed on the course, right now. */
function getProgress(userId: number, courseId: number): RefundRequestProgress {
  const lessonIds = getLessonIdsForCourse(courseId);
  return {
    watchedSeconds: getWatchedSeconds(userId, lessonIds),
    completedLessons: getCompletedLessonCount(userId, lessonIds),
    totalLessons: lessonIds.length,
  };
}

export type DeclineResult =
  | { ok: true; refundRequest: typeof refunds.$inferSelect }
  | { ok: false; reason: "not-found" | "already-resolved" };

/**
 * Decline an Open Refund Request: nothing is given back and the learner keeps
 * their Enrollment (ADR 0003).
 */
export function declineRefundRequest(
  refundId: number,
  platformAdminId: number,
  now: Date = new Date()
): DeclineResult {
  // Only an Open request can be resolved. The status check sits in the update
  // itself, so two Platform Admins resolving at once cannot both succeed.
  const refundRequest = db
    .update(refunds)
    .set({
      status: RefundStatus.Declined,
      resolvedAt: now.toISOString(),
      resolvedByUserId: platformAdminId,
    })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open)))
    .returning()
    .get();

  if (refundRequest) return { ok: true, refundRequest };
  return { ok: false, reason: whyNotOpen(refundId) };
}

/** Why a Refund Request could not be resolved: it is gone, or no longer Open. */
function whyNotOpen(refundId: number) {
  const exists = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.id, refundId))
    .get();
  return exists ? ("already-resolved" as const) : ("not-found" as const);
}

export type ApproveResult =
  | { ok: true; refundRequest: typeof refunds.$inferSelect }
  | { ok: false; reason: "not-found" | "already-resolved" };

/**
 * Approve an Open Refund Request: a Refund is due, for the Amount Refunded the
 * Platform Admin entered, and the Purchase becomes a Refunded Purchase.
 * Approved is final. On an Individual Purchase the learner's Enrollment ends
 * (ADR 0003). On a Team Licence no Enrollment ends: its Seats were held while
 * the request was Open, so none is claimed, and now none can be (ADR 0002).
 */
export function approveRefundRequest(
  refundId: number,
  platformAdminId: number,
  amountRefunded: number,
  now: Date = new Date()
): ApproveResult {
  // The approval and the Enrollment ending happen together or not at all.
  return db.transaction((tx) => {
    const purchase = tx
      .select({
        status: refunds.status,
        id: purchases.id,
        userId: purchases.userId,
        courseId: purchases.courseId,
      })
      .from(refunds)
      .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
      .where(eq(refunds.id, refundId))
      .get();

    if (!purchase) return { ok: false, reason: "not-found" };
    if (purchase.status !== RefundStatus.Open) {
      return { ok: false, reason: "already-resolved" };
    }
    // Only the payment service sets a Payment Transfer Status, so it stays null.
    const refundRequest = tx
      .update(refunds)
      .set({
        status: RefundStatus.Approved,
        amountRefunded,
        resolvedAt: now.toISOString(),
        resolvedByUserId: platformAdminId,
      })
      .where(
        and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open))
      )
      .returning()
      .get();

    if (!refundRequest) return { ok: false, reason: "already-resolved" };

    // An Enrollment doesn't record its Purchase, so it is found by learner and
    // course alone, and left alone if their team paid for a place too
    // (ADR 0004). Progress is kept (ADR 0001).
    if (
      !isTeamLicence(purchase.id) &&
      !holdsClaimedSeat(purchase.userId, purchase.courseId)
    ) {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, purchase.userId),
            eq(enrollments.courseId, purchase.courseId)
          )
        )
        .run();
    }

    return { ok: true, refundRequest };
  });
}

/** The learner's own Refund Requests, whatever their status, newest first. */
export function getRefundRequestsForLearner(userId: number) {
  return db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      resolvedAt: refunds.resolvedAt,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(purchases.userId, userId))
    .orderBy(desc(refunds.requestedAt), desc(refunds.id))
    .all();
}

const resolvers = alias(users, "resolvers");

/** Every Approved and Declined Refund Request, most recently resolved first. */
export function getResolvedRefundRequests() {
  const rows = db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      resolvedAt: refunds.resolvedAt,
      resolvedBy: { id: resolvers.id, name: resolvers.name },
      buyer: { id: users.id, name: users.name, email: users.email },
      course: { id: courses.id, title: courses.title, slug: courses.slug },
      amountRefunded: refunds.amountRefunded,
      paymentTransferStatus: refunds.paymentTransferStatus,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .leftJoin(resolvers, eq(refunds.resolvedByUserId, resolvers.id))
    .where(
      inArray(refunds.status, [RefundStatus.Approved, RefundStatus.Declined])
    )
    .orderBy(desc(refunds.resolvedAt), desc(refunds.id))
    .all();

  return rows.map((row) => ({
    ...row,
    moneyStillOwed: isMoneyStillOwed(row.paymentTransferStatus),
  }));
}

/**
 * A Failed or Canceled transfer means the Refund never went out. The request
 * stays Approved, so the money is still owed to the learner.
 */
function isMoneyStillOwed(status: PaymentTransferStatus | null) {
  return (
    status === PaymentTransferStatus.Failed ||
    status === PaymentTransferStatus.Canceled
  );
}
