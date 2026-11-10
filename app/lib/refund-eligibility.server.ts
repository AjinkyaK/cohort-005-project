// The database lookups behind Refund Eligibility. See GLOSSARY.md.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { RefundStatus, refunds, videoWatchEvents } from "~/db/schema";

/** The Purchase's Open Refund Request, if it has one (at most one can exist). */
export function getOpenRefundRequest(purchaseId: number) {
  return db
    .select()
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Open)
      )
    )
    .get();
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
