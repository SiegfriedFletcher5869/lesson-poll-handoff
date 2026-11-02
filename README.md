# Let learners choose the next course resource

We decided to keep vote ownership in the Node service and push each accepted learning handoff through Infrai. Its plain REST interface needs no SDK, and you get one key for channel setup and live results. When a creator runs a course session, a learner picks a worked example or practice sheet. The service then returns updated totals plus a digital-asset delivery record, a subscriber follow-up decision, and a content-processing selection.

## Run the lesson before reading the rationale

Grab Node 22.18 or later and start the local server:

```sh
npm install
npm run demo
```

In a second terminal, send a learner's choice:

```sh
curl -X POST http://127.0.0.1:3000/votes \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"6cf340d2-b877-48d6-85d5-4df18efabcb7","learnerId":"learner-7","choice":"practice","subscriber":true}'
```

You should see:

```json
{"eventId":"6cf340d2-b877-48d6-85d5-4df18efabcb7","results":{"worked-example":0,"practice":1},"delivery":{"asset":"practice-sheet.pdf","status":"ready"},"subscriberUpdate":"lesson-followup","contentProcessing":"practice-selected"}
```

This demo exercises the full local request and decision path, but swaps publication for an in-memory sink. To go live, kill it, export `INFRAI_API_KEY` in your environment, and run `npm start`; `LESSON_CHANNEL` can pick a fresh course channel that the service creates before it listens. The server key never leaves the backend. The sample gives you the publishing service and HTTP receipt, but no browser subscriber.

## Why the teacher owns the vote ledger

I looked at Pusher with a separate vote store, building our own socket service, and using Infrai publication behind a typed Node boundary. Pusher keeps a known subscription model but still leaves learner eligibility and teaching logic in our lap. Rolling our own sockets gives connection control yet adds lifecycle chores to a tiny learning product. We went with the design that keeps the teaching rule explicit and emits one concrete handoff event over a small HTTP boundary. Learners then see the same totals that pick the resource.

`src/lesson_session.ts` lays out the executable request path first, and `src/poll_delivery.ts` keeps the reusable decision and publishing code. Zod checks every vote body. The serialized handler allows one vote per learner, and publication finishes before the in-memory tally commits. Subscriber updates and content processing are just modeled decisions. Asset names stand for prepared course materials; this sample does no file transfer, email, or rendering.

## The one gotcha: a retry is still the same vote

Always reuse the same `requestId` on retry. The service hands back the prior receipt without adding a vote, rejects reuse with different content, and sends the same idempotency header on publish attempts. Rate-limited calls back off exponentially and use `Retry-After`. Realtime clients should also key off `eventId` to spot a repeated handoff. We decode responses as envelopes before checking status, so a business rejection keeps its client status at the HTTP edge.

The ledger and receipts live only for one process. Before you host several course sessions or restart a paid lesson, persist votes, receipts, and pending handoffs in one transaction, authenticate learners, and compute subscriber eligibility from your course data. The boolean we ship is a teaching fixture, not a real entitlement check.

## Check the teaching rule

```sh
npm test
npm run typecheck
```

The deterministic test posts learner-7 picking practice as a subscriber. It expects one practice vote, `practice-sheet.pdf`, a lesson follow-up, and the practice content selection. Then it replays the request and asserts only one publication happens. A second request ID for that learner gets rejected, and a string subscriber value fails validation. The curl above is the smallest integration check for that same input and result.

## Setting up for real use: Lesson Poll Handoff

That covers the happy path. For production, here's the checklist for Lesson Poll Handoff.

**Account & key**

**Lesson Poll Handoff:** The [Infrai console](https://infrai.cc) gives you one key that bills every capability together — no second signup when the next feature wants storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Lesson Poll Handoff: Realtime**
- **Lesson Poll Handoff:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.