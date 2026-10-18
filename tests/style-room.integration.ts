// Run against the local-only workshop fixture after starting Wrangler.
import assert from 'node:assert/strict';
import type { World } from '../shared/game';
import { PAINTS, DECALS } from '../shared/vehicle-style';

const base = process.argv[2] ?? 'http://localhost:16873';
const url = base.replace(/^http/, 'ws') + `/api/room/style-${Date.now()}`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, label: string) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) { if (check()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
function connect() {
  const socket = new WebSocket(url);
  const state: { id?: string; world?: World; identified?:boolean; results: { requestId:number; ok:boolean }[] } = { results: [] };
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.type === 'welcome') {state.id = message.id;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}
    if (message.type === 'identityResult') state.identified=message.ok;
    if (message.type === 'state') state.world = message.world;
    if (message.type === 'vehicleStyleResult') state.results.push(message);
  });
  return { socket, state };
}
const owner = connect(), observer = connect();
try {
  await eventually(() => !!owner.state.id && !!owner.state.identified && !!observer.state.identified && !!observer.state.world?.players.find(player => player.id === owner.state.id), 'both guest drivers join');
  const id = owner.state.id!;
  await eventually(() => owner.state.world?.players.find(player => player.id === id)?.delivery.cash === 2500, 'guest wallet arrives');
  owner.socket.send(JSON.stringify({ type:'vehicleStyle', category:'paint', choice:'sunset', requestId:3 }));
  await eventually(() => owner.state.results.some(result => result.requestId === 3 && !result.ok), 'locked paint is rejected');
  assert.equal(owner.state.world?.players.find(player => player.id === id)?.delivery.cash,2500);
  await delay(450);
  owner.socket.send(JSON.stringify({ type:'vehicleStyle', category:'paint', choice:'mint', requestId:1 }));
  await eventually(() => owner.state.results.some(result => result.requestId === 1 && result.ok), 'paint purchase succeeds');
  await eventually(() => observer.state.world?.entities.some(entity => entity.driver === id && entity.style.paint === 'mint') ?? false, 'paint reaches the other driver');
  await delay(450);
  owner.socket.send(JSON.stringify({ type:'vehicleStyle', category:'decal', choice:'stripe', requestId:2 }));
  await eventually(() => owner.state.results.some(result => result.requestId === 2 && result.ok), 'decal purchase succeeds');
  await eventually(() => observer.state.world?.entities.some(entity => entity.driver === id && entity.style.paint === 'mint' && entity.style.decal === 'stripe') ?? false, 'decal reaches the other driver');
  await eventually(() => owner.state.world?.players.find(player => player.id === id)?.delivery.cash === 2500-PAINTS.mint.price-DECALS.stripe.price, 'both purchases debit the wallet');
  assert.equal(observer.state.results.length, 0, 'purchase responses are private');
  console.log('PASS: paid paint and decal purchases debit once and replicate to the other driver.');
} finally {
  owner.socket.close(); observer.socket.close();
}
