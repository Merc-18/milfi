import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStamp } from '../src/presentation/buildStamp.js';

test('build stamp is ddMMyyyyHHmmss in Lima time, not the build machine zone', () => {
  assert.equal(buildStamp(new Date('2026-10-23T19:05:09Z')), '23102026140509');
  // 03:00 UTC is still the previous day (22:00) in Lima.
  assert.equal(buildStamp(new Date('2026-10-24T03:00:00Z')), '23102026220000');
  // Midnight is 00, never 24; the year rolls back too.
  assert.equal(buildStamp(new Date('2027-01-01T05:00:00Z')), '01012027000000');
  assert.equal(buildStamp(new Date('2027-01-01T04:59:59Z')), '31122026235959');
  assert.match(buildStamp(), /^\d{14}$/);
});
