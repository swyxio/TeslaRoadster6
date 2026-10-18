import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_RELEASE } from '../content/releases';
import { LAST_PLAYED_KEY, readLastPlayed, writeLastPlayed } from '../src/release-tracker';

function store(initial?: string) {
  let value = initial ?? null;
  return { getItem: (key:string) => key === LAST_PLAYED_KEY ? value : null, setItem: (key:string, next:string) => { if(key === LAST_PLAYED_KEY)value = next; } };
}
test('records the current release and time for the next visit', () => {
  const storage = store();
  assert.equal(readLastPlayed(storage), null);
  assert.equal(writeLastPlayed(storage, new Date('2026-10-18T12:34:56Z')), true);
  assert.deepEqual(readLastPlayed(storage), {version:CURRENT_RELEASE.version,playedAt:'2026-10-18T12:34:56.000Z'});
});
test('bad or unavailable browser storage never interrupts play', () => {
  for (const value of ['{', '{}', '{"version":"bad<script>","playedAt":"yesterday"}']) assert.equal(readLastPlayed(store(value)), null);
  const blocked = {getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(readLastPlayed(blocked), null);
  assert.equal(writeLastPlayed(blocked), false);
});
