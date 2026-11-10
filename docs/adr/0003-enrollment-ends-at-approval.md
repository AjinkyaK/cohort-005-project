# A learner's Enrollment ends when their Refund Request is approved

A learner keeps full access to the course while their Refund Request is Open. Their Enrollment ends only when a Platform Admin approves the request, and declining changes nothing. We chose approval as the cut-off because the request might still be Declined; locking the learner out before then would penalise someone who may be owed nothing back. This also matches the glossary: a learner counts as refunded from the moment of approval, whatever the Payment Transfer Status. Their progress is kept (ADR 0001). Which Enrollment ends, and when it is left alone, is covered in ADR 0004.

## Considered Options

- **End access when the request is raised.** Rejected: a learner whose request is later Declined would have lost access for nothing.
- **Never end access.** Rejected: a learner would keep the course after getting their money back.

## Consequences

- A Platform Admin sees progress as it stands now, not as it was when the request was raised. The learner still has access while the request is Open, and nothing records a snapshot, so their numbers can rise during review.
- After approval, a learner can hold more than one Purchase of the same course. Code that looks up "the learner's Purchase" (for example the PPP country check) must pick the one that isn't refunded.
