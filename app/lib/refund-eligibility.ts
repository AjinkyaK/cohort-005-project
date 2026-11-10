// The rules for Refund Eligibility that need no database. See GLOSSARY.md.

import { getDiscountForCountry } from "./ppp";

export const REFUND_WINDOW_DAYS = 14;
export const WATCH_LIMIT_SECONDS = 2 * 60 * 60;
// Half of a course's lessons completed.
export const COMPLETION_LIMIT = 0.5;

// The Refund Window is counted in whole calendar days in the platform's local
// time, not in hours — someone who buys at 23:00 still gets the whole of their
// fourteenth day.
function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

export function isWithinRefundWindow(
  purchasedAtIso: string,
  now: Date = new Date()
): boolean {
  const today = calendarDay(now);
  const purchaseDay = calendarDay(new Date(purchasedAtIso));
  return today >= purchaseDay && today <= lastDayOfRefundWindow(purchasedAtIso);
}

/**
 * The Refund Amount quoted to the learner: what they paid if they bought at a
 * purchasing-power discount, otherwise the course's current list price.
 */
export function getRefundAmount(
  purchase: { amountPaid: number; country: string | null },
  course: { price: number }
): number {
  return getDiscountForCountry(purchase.country) > 0
    ? purchase.amountPaid
    : course.price;
}
