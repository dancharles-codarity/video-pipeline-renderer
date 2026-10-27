// The MCP connector endpoint: POST /api/mcp, token as a Bearer header or ?token=.
import { authorised, tokenFrom } from '../src/service.js';
import { useBundledBinaries } from '../src/ffmpeg.js';
import { mcp } from '../src/mcp.js';

let ready;

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (!authorised(tokenFrom(req))) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorised.' }, id: null });
  }
  if (req.method === 'GET' || req.method === 'DELETE') return res.status(405).setHeader('Allow', 'POST').end();
  if (req.method !== 'POST') return res.status(405).end();
  ready ??= useBundledBinaries();
  await ready;
  const { status, json } = await mcp(req.body);
  if (status === 202) return res.status(202).end();
  res.status(status).json(json);
}
