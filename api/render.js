// POST /api/render with a bearer token. See README for the request shape.
import { authorised, handle, HttpError, tokenFrom, recycleAfterReply } from '../src/service.js';
import { useBundledBinaries } from '../src/ffmpeg.js';

let ready;

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!authorised(tokenFrom(req))) return res.status(401).json({ error: 'unauthorised' });
  recycleAfterReply(res);
  try {
    ready ??= useBundledBinaries();
    await ready;
    res.status(200).json(await handle(req.body));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    res.status(status).json({ error: e.message });
  }
}
