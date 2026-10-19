// Integration-test wrapper only. Never used by the recorder or deployed.
// Exercises the real stage method against a disposable synthetic room state.
import stageWorker, { GameRoom as StagedRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService } from './playtest-stage-worker';
import { CUSTOMERS, RESTAURANTS } from '../../shared/delivery';
import type { World } from '../../shared/game';

export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService };

export class GameRoom extends StagedRoom {
  async integrationPrepare() {
    const world = Reflect.get(this, 'world') as World, player = world.players[0];
    const session = [...(Reflect.get(this, 'sessions') as Map<WebSocket, { economy: object }>).values()][0];
    const draft = Reflect.get(session.economy, 'draft') as { delivery: typeof player.delivery };
    draft.delivery.completed = 1;
    const progress = Reflect.apply(Reflect.get(session.economy, 'progress'), session.economy, []);
    const outcome = await new Promise<{ ok: boolean }>(resolve => Reflect.apply(Reflect.get(session.economy, 'enqueue'), session.economy, [{ kind: 'progress', progress }, undefined, resolve]));
    if (!outcome.ok) throw new Error('Synthetic test progress rejected');
    for (let i = 0; i < 500 && (Reflect.get(session.economy, 'pending') || Reflect.get(session.economy, 'processing')); i++) await new Promise(resolve => setTimeout(resolve, 10));
    if (Reflect.get(session.economy, 'pending') || Reflect.get(session.economy, 'processing')) throw new Error('Synthetic wallet did not settle');
    const car = world.entities.find(entity => entity.id === player.entityId)!;
    const target = CUSTOMERS[player.delivery.order.customer];
    Reflect.deleteProperty(player.delivery.order, 'search');
    Object.assign(car, { x: target.x, y: target.y, z: target.z, speed: 0, vy: 0, supportId: 'ground' });
    return { ok: true };
  }

  integrationStop(stage: string | null) {
    const world = Reflect.get(this, 'world') as World, player = world.players[0];
    if (stage !== player.delivery.order.stage) return { ok: false };
    const car = world.entities.find(entity => entity.id === player.entityId)!;
    const target = stage === 'pickup' ? RESTAURANTS[player.delivery.order.restaurant] : CUSTOMERS[player.delivery.order.customer];
    // Test-only synthetic position; the ordinary tick and wallet still process
    // the pickup or drop-off and its progression.
    Object.assign(car, { x: target.x, y: 0, z: target.z, vx: 0, vy: 0, vz: 0, pushX: 0, pushZ: 0, speed: 0, supportId: 'ground', autopilot: false, navigation: null });
    return { ok: true };
  }

  async integrationRepeatCases(room: string) {
    const world = Reflect.get(this, 'world') as World;
    const sessions = Reflect.get(this, 'sessions') as Map<WebSocket, { guest: boolean; attachPending: boolean; identitySequence: number; poseRevision: number; economy: object }>;
    const session = [...sessions.values()][0], player = world.players[0];
    const first = await this.playtestRepeat(room);
    await this.integrationPrepare();
    const car = world.entities.find(entity => entity.id === player.entityId)!;
    // Keep this synthetic rejection/commit test stationary while its local
    // wallet RPC settles; normal ticking is tested through the HTTP case.
    const timer = Reflect.get(this, 'timer') as ReturnType<typeof setInterval>;
    clearInterval(timer);
    const oldOrder = player.delivery.order;
    Reflect.set(player.delivery.order, 'search', {});
    const pending = await this.playtestRepeat(room);
    Reflect.deleteProperty(player.delivery.order, 'search');
    const staging = Reflect.get(session.economy, 'staging') as Set<Promise<unknown>>, marker = Promise.resolve();
    staging.add(marker); const pendingWallet = await this.playtestRepeat(room); staging.delete(marker);

    session.guest = false; const notGuest = await this.playtestRepeat(room); session.guest = true;
    session.attachPending = true; const attaching = await this.playtestRepeat(room); session.attachPending = false;
    session.identitySequence++; const identity = await this.playtestRepeat(room); session.identitySequence--;
    session.poseRevision++; const relocated = await this.playtestRepeat(room); session.poseRevision--;
    player.delivery.level = 1; const level = await this.playtestRepeat(room); player.delivery.level = 0;
    car.speed = 8; const moving = await this.playtestRepeat(room); car.speed = 0;
    const restaurant = RESTAURANTS[player.delivery.order.restaurant];
    const originalX = restaurant.x;
    Reflect.set(restaurant, 'x', originalX + 1);
    const catalog = await this.playtestRepeat(room);
    Reflect.set(restaurant, 'x', originalX);
    const otherRestaurant = RESTAURANTS[(player.delivery.order.restaurant + 1) % RESTAURANTS.length];
    const otherId = otherRestaurant.id;
    Reflect.set(otherRestaurant, 'id', restaurant.id);
    const duplicate = await this.playtestRepeat(room);
    Reflect.set(otherRestaurant, 'id', otherId);
    const firstRestaurant = Reflect.get(this, 'repeat')!.firstOrder.restaurant as { x: number; z: number };
    const originalZ = restaurant.z, firstX = firstRestaurant.x, firstZ = firstRestaurant.z;
    Reflect.set(restaurant, 'x', 390); Reflect.set(restaurant, 'z', -120); firstRestaurant.x = 390; firstRestaurant.z = -120;
    const access = await this.playtestRepeat(room);
    Reflect.set(restaurant, 'x', originalX); Reflect.set(restaurant, 'z', originalZ); firstRestaurant.x = firstX; firstRestaurant.z = firstZ;

    const rejectsPreserveOrder = player.delivery.order === oldOrder;
    const beforeCar = JSON.stringify(car);
    const { order: _order, ...beforeDelivery } = structuredClone(player.delivery);
    const success = await this.playtestRepeat(room);
    const { order: _after, ...afterDelivery } = structuredClone(player.delivery);
    const twice = await this.playtestRepeat(room);
    Reflect.set(this, 'timer', setInterval(() => Reflect.apply(Reflect.get(this, 'tick'), this, []), 50));
    return { first, pending, pendingWallet, notGuest, attaching, identity, relocated, level, moving, catalog, duplicate, access, success, twice, rejectsPreserveOrder,
      carUnchanged: JSON.stringify(car) === beforeCar,
      deliveryUnchanged: JSON.stringify(beforeDelivery) === JSON.stringify(afterDelivery),
      orderReplaced: player.delivery.order !== oldOrder };
  }
}

export default {
  async fetch(request: Request, env: Parameters<typeof stageWorker.fetch>[1], ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url), match = /^\/api\/test-(repeat|prepare|stop)\/([a-z0-9][a-z0-9-]{0,31})$/.exec(url.pathname);
    if (!match) return stageWorker.fetch(request, env, ctx);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || request.method !== 'POST' || (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin)) return new Response('Denied', { status: 403 });
    const expected = Reflect.get(env, 'PLAYTEST_STAGE_SECRET');
    const provided = /^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (typeof expected !== 'string' || !provided || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(provided), new TextEncoder().encode(expected))) return new Response('Unauthorized', { status: 401 });
    const rooms = env.ROOMS as unknown as DurableObjectNamespace<GameRoom>;
    const stub = rooms.get(rooms.idFromName(match[2]));
    return Response.json(match[1] === 'repeat' ? await stub.integrationRepeatCases(match[2]) :
      match[1] === 'prepare' ? await stub.integrationPrepare() : await stub.integrationStop(url.searchParams.get('stage')));
  },
};
