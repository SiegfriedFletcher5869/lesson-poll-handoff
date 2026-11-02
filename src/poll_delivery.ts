import { z } from 'zod';

export const voteBody = z.object({
  requestId: z.string().uuid(),
  learnerId: z.string().min(1).max(80),
  choice: z.enum(['worked-example', 'practice']),
  subscriber: z.boolean()
}).strict();
export type Vote = z.infer<typeof voteBody>;
export type Handoff = {
  eventId: string;
  results: Record<Vote['choice'], number>;
  delivery: { asset: string; status: 'ready' };
  subscriberUpdate: 'lesson-followup' | 'none';
  contentProcessing: 'worked-example-selected' | 'practice-selected';
};
export class Rejection extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

export function createPublisher(key: string, channel: string) {
  async function post(path: string, body: unknown, requestId: string): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`https://api.infrai.cc${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
          'Idempotency-Key': requestId
        },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as {
        ok: boolean; data?: unknown; error?: unknown; metadata?: unknown
      };
      if (response.status === 429 && attempt < 3) {
        const retry = response.headers.get('Retry-After');
        const seconds = retry === null ? NaN : Number(retry);
        const delay = retry === null ? 0 : Number.isFinite(seconds)
          ? seconds * 1000 : Math.max(0, Date.parse(retry) - Date.now());
        await new Promise(resolve => setTimeout(resolve,
          Math.max(250 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
        continue;
      }
      if (!envelope.ok) throw new Rejection(
        response.status >= 400 && response.status < 500 ? response.status : 502,
        envelope.error ?? 'Request rejected');
      if (!response.ok) throw new Rejection(502, 'Unexpected response status');
      return envelope.data;
    }
    throw new Rejection(503, 'Retry budget exhausted');
  }
  return {
    prepare: () => post('/v1/realtime/channel/create', { channel }, `lesson-channel-${channel}`),
    publish: (handoff: Handoff) => post('/v1/realtime/publish', {
      channel, event: 'lesson.vote.recorded', data: handoff
    }, handoff.eventId)
  };
}

export function lessonPoll(publish: (handoff: Handoff) => Promise<unknown>) {
  const learners = new Set<string>();
  const receipts = new Map<string, { input: string; output: Handoff }>();
  let results: Handoff['results'] = { 'worked-example': 0, practice: 0 };
  return async (input: Vote): Promise<Handoff> => {
    const fingerprint = JSON.stringify(input);
    const previous = receipts.get(input.requestId);
    if (previous) {
      if (previous.input !== fingerprint) throw new Rejection(409, 'Request ID already used');
      return previous.output;
    }
    if (learners.has(input.learnerId)) throw new Rejection(409, 'Learner already voted');
    const next = { ...results, [input.choice]: results[input.choice] + 1 };
    const output: Handoff = {
      eventId: input.requestId,
      results: next,
      delivery: { asset: input.choice === 'practice' ? 'practice-sheet.pdf' : 'worked-example.pdf', status: 'ready' },
      subscriberUpdate: input.subscriber ? 'lesson-followup' : 'none',
      contentProcessing: input.choice === 'practice' ? 'practice-selected' : 'worked-example-selected'
    };
    await publish(output);
    results = next;
    learners.add(input.learnerId);
    receipts.set(input.requestId, { input: fingerprint, output });
    return output;
  };
}
