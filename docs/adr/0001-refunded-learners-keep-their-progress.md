# A refunded learner's progress is kept

When a Refund Request is Approved and the learner's Enrollment ends (see ADR 0003), their progress (lesson progress, video watch events, quiz attempts) is kept, even though they can no longer reach it. Watched Time carries over between Purchases, and keeping it is what stops a learner from repeatedly buying, watching, refunding and re-buying, each time with a fresh Watch Limit. It also means a learner who buys again picks up where they left off.

## Considered Options

- **Delete progress on approval.** Rejected: it resets Watched Time and so reopens the buy, watch, refund loop. It also can't be undone.
