import { describe, it, expect } from "vitest";
import {
  getRefundAmount,
  isWithinRefundWindow,
  lastDayOfRefundWindow,
} from "./refund-eligibility";

// Local-time constructors, because the Refund Window is counted in the
// platform's local time.
function at(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour);
}

describe("Refund Window", () => {
  it("ends on the 14th calendar day after the purchase day", () => {
    expect(lastDayOfRefundWindow(at(2026, 3, 1).toISOString())).toBe(
      "2026-03-15"
    );
  });

  it("gives a late-night purchase the whole of its 14th day", () => {
    const purchasedAt = at(2026, 3, 1, 23).toISOString();

    expect(isWithinRefundWindow(purchasedAt, at(2026, 3, 15, 23))).toBe(true);
  });

  it("closes once the 14th day is over", () => {
    const purchasedAt = at(2026, 3, 1, 23).toISOString();

    expect(isWithinRefundWindow(purchasedAt, at(2026, 3, 16, 0))).toBe(false);
  });

  it("is open on the purchase day itself", () => {
    const purchasedAt = at(2026, 3, 1, 9).toISOString();

    expect(isWithinRefundWindow(purchasedAt, at(2026, 3, 1, 10))).toBe(true);
  });

  it("is not open before the purchase day", () => {
    const purchasedAt = at(2026, 3, 1, 9).toISOString();

    expect(isWithinRefundWindow(purchasedAt, at(2026, 2, 28))).toBe(false);
  });

  it("counts across a month end", () => {
    expect(lastDayOfRefundWindow(at(2026, 1, 25).toISOString())).toBe(
      "2026-02-08"
    );
  });
});

describe("Refund Amount", () => {
  it("quotes what was paid when the Purchase had a purchasing-power discount", () => {
    // India gets a purchasing-power discount, so the learner paid less.
    expect(
      getRefundAmount({ amountPaid: 3950, country: "IN", isTeamLicence: false }, { price: 7900 })
    ).toBe(3950);
  });

  it("quotes the course's current list price otherwise", () => {
    // Bought at $79, since repriced to $99: the quote follows the course.
    expect(
      getRefundAmount({ amountPaid: 7900, country: "US", isTeamLicence: false }, { price: 9900 })
    ).toBe(9900);
  });

  it("quotes the list price when the Purchase has no country", () => {
    expect(
      getRefundAmount({ amountPaid: 7900, country: null, isTeamLicence: false }, { price: 7900 })
    ).toBe(7900);
  });

  it("quotes what was paid for a Team Licence bought at full price", () => {
    // Five Seats at $79 each, since repriced to $99: the quote is still what was paid.
    expect(
      getRefundAmount(
        { amountPaid: 39500, country: "US", isTeamLicence: true },
        { price: 9900 }
      )
    ).toBe(39500);
  });

  it("quotes what was paid for a Team Licence bought at a purchasing-power discount", () => {
    expect(
      getRefundAmount(
        { amountPaid: 19750, country: "IN", isTeamLicence: true },
        { price: 7900 }
      )
    ).toBe(19750);
  });
});
