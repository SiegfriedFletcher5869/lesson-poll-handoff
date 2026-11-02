import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonPoll, Rejection, voteBody } from './poll_delivery.ts';

test('one learner earns one handoff; replay does not increment results', async () => {
  let publications = 0;
  const vote = lessonPoll(async () => { publications++; });
  const input = voteBody.parse({
    requestId: '6cf340d2-b877-48d6-85d5-4df18efabcb7',
    learnerId: 'learner-7', choice: 'practice', subscriber: true
  });
  const output = await vote(input);
  assert.deepEqual(output.results, { 'worked-example': 0, practice: 1 });
  assert.equal(output.delivery.asset, 'practice-sheet.pdf');
  assert.equal(output.subscriberUpdate, 'lesson-followup');
  assert.equal(output.contentProcessing, 'practice-selected');
  assert.deepEqual(await vote(input), output);
  await assert.rejects(vote({ ...input, requestId: '97916668-a24e-4e70-bb27-3f306e10fb7c' }),
    (error: unknown) => error instanceof Rejection && error.status === 409);
  assert.equal(publications, 1);
  assert.equal(voteBody.safeParse({ ...input, subscriber: 'yes' }).success, false);
});
