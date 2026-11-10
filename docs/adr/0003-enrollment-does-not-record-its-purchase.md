# An Enrollment does not record which Purchase it came from

A learner has at most one Enrollment per course, whether it came from an Individual Purchase or a Claimed Seat, and the Enrollment doesn't record which. A Refund Request, by contrast, belongs to one specific Purchase. So when a Platform Admin approves a refund on an Individual Purchase, the system can't just end "that Purchase's Enrollment". It must check whether the learner also holds a Claimed Seat on that course, and leave their Enrollment alone if they do. Otherwise a refund on money the learner paid would take away a place their team paid for.

## Consequences

- Today the learner can't actually be in both positions. The purchase page refuses to sell to someone already enrolled, and a Seat can't be claimed by someone already enrolled. The Claimed Seat check is a guard against either rule loosening later, not dead code.
- Finding the Enrollment to end uses only the learner and the course.
- If Enrollment ever starts recording its Purchase or Seat, this ADR is superseded, and so is the Claimed Seat check.
