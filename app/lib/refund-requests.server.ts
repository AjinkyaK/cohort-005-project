// The Platform Admin's view of Refund Requests. See GLOSSARY.md.

import { asc, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  RefundStatus,
  coupons,
  courses,
  purchases,
  refunds,
  users,
} from "~/db/schema";
import { getRefundAmount } from "./refund-eligibility";
import {
  getCompletedLessonCount,
  getLessonIdsForCourse,
  getWatchedSeconds,
} from "./refund-eligibility.server";

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

  return rows.map(({ isTeamLicence, country, ...row }) => {
    if (isTeamLicence) {
      return {
        ...row,
        purchaseKind: "team-licence" as PurchaseKind,
        // A Team Licence's Refund Amount is what was paid, and its buyer's own
        // viewing says nothing about whether the team used it (ADR 0002).
        refundAmount: row.amountPaid,
        progress: null,
      };
    }

    return {
      ...row,
      purchaseKind: "individual" as PurchaseKind,
      refundAmount: getRefundAmount(
        { amountPaid: row.amountPaid, country },
        row.course
      ),
      // Live numbers, not a snapshot from when the request was raised (ADR 0003).
      progress: getProgress(row.buyer.id, row.course.id),
    };
  });
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
