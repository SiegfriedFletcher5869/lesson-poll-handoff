import { createServer } from 'node:http';
import { createPublisher, lessonPoll, Rejection, voteBody } from './poll_delivery.ts';

const demo = process.argv.includes('--demo');
const key = process.env.INFRAI_API_KEY;
if (!demo && !key) throw new Error('Set INFRAI_API_KEY');
const publisher = demo ? { prepare: async () => {}, publish: async () => {} }
  : createPublisher(key!, process.env.LESSON_CHANNEL ?? 'course-live-poll');
await publisher.prepare();
const vote = lessonPoll(publisher.publish);
// Serialize decisions so two requests cannot reserve the same learner vote.
let queue: Promise<unknown> = Promise.resolve();
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  try {
    if (request.method !== 'POST' || request.url !== '/votes') {
      response.writeHead(404).end(JSON.stringify({ error: 'Use POST /votes' }));
      return;
    }
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 8192) throw new Rejection(413, 'Body too large');
    }
    let decoded: unknown;
    try { decoded = JSON.parse(body); }
    catch { throw new Rejection(400, 'Expected JSON'); }
    const parsed = voteBody.safeParse(decoded);
    if (!parsed.success) throw new Rejection(400, parsed.error.flatten());
    const pending = queue.then(() => vote(parsed.data));
    queue = pending.catch(() => {});
    const output = await pending;
    response.writeHead(200).end(JSON.stringify(output));
  } catch (error) {
    const status = error instanceof Rejection ? error.status : 502;
    response.writeHead(status).end(JSON.stringify({
      error: error instanceof Rejection ? error.detail : 'Delivery request could not complete'
    }));
  }
});
server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => {
  console.log(`Lesson poll listening on http://127.0.0.1:${process.env.PORT ?? 3000}`);
});
