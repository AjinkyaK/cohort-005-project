# Approving a refund ends access at that moment, and the learner's progress is kept

A learner keeps full access to the course while their Refund Request is Open. Their Enrollment ends only when a Platform Admin approves the request, and declining changes nothing. We chose approval as the cut-off because the request might still be Declined; locking the learner out before then would penalise someone who may be owed nothing back. Their progress (lesson progress, video watch events, quiz attempts) is kept after approval, even though they can no longer reach it. Watched Time carries over between Purchases, and keeping it is what stops a learner from repeatedly buying, watching, refunding and re-buying, each time with a fresh Watch Limit. It also means a learner who buys again picks up where they left off.

## Considered Options

- **End access when the request is raised.** Rejected: a learner whose request is later Declined would have lost access for nothing.
- **Delete progress on approval.** Rejected: it resets Watched Time and so reopens the buy, watch, refund loop. It also can't be undone.
- **Never end access.** Rejected: a learner would keep the course after getting their money back.

## Consequences

- A Platform Admin sees progress as it stands now, not as it was when the request was raised. Nothing records a snapshot, so the learner's numbers can rise while the request is Open.
- After approval, a learner can hold more than one Purchase of the same course. Code that looks up "the learner's Purchase" (for example the PPP country check) must pick the one that isn't refunded.
