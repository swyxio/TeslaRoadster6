// Run against Wrangler or deployment: pnpm exec tsx tests/room.integration.ts [http://localhost:8787]
import assert from 'node:assert/strict';
import { NEUTRAL, type World } from '../shared/game';
const base = process.argv[2] ?? 'http://localhost:8787';
const url = base.replace(/^http/, 'ws') + `/api/room/test-${Date.now()}`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, label: string, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
function connect() {
  const socket = new WebSocket(url);
  const state: { id?: string; world?: World; capacity?: number; closed?: number } = {};
  socket.addEventListener('message', event => {
    const data = JSON.parse(String(event.data));
    if (data.type === 'welcome') { assert.equal(data.version, 1); state.id = data.id; state.capacity = data.capacity; }
    if (data.type === 'state') state.world = data.world;
  });
  socket.addEventListener('close', event => { state.closed = event.code; });
  return { socket, state };
}
const one = connect(), two = connect();
try {
  await eventually(() => !!one.state.id && !!two.state.id && one.state.world?.players.length === 2 && two.state.world?.players.length === 2, 'two players visible in both snapshots');
  const id = one.state.id!;
  const entityId = one.state.world!.players.find(p => p.id === id)!.entityId;
  const initial = one.state.world!.entities.find(e => e.id === entityId)!.z;
  for (let i = 0; i < 20; i++) { one.socket.send(JSON.stringify({ type: 'input', input: { ...NEUTRAL, throttle: 1 } })); await delay(50); }
  await eventually(() => (two.state.world?.entities.find(e => e.id === entityId)?.z ?? initial) < initial - 4, 'remote player receives authoritative movement');
  one.socket.send(JSON.stringify({ type: 'input', input: { ...NEUTRAL, throttle: 900 } }));
  await eventually(() => one.state.closed === 1008 && two.state.world?.players.length === 1, 'invalid input closes only offending player and removes entity');
  const response = await fetch(base + '/api/room/test'); assert.equal(response.status, 426);
  const invalid = await fetch(base + '/api/room/INVALID'); assert.equal(invalid.status, 404);
  console.log(`PASS: two-client join, remote movement, invalid-input isolation, disconnect cleanup, route checks; advertised capacity ${two.state.capacity}. This is not a load test.`);
} finally { one.socket.close(); two.socket.close(); }
