import assert from 'node:assert/strict';
import {
  buildAssetCacheHeaders,
  buildPrivateApiCacheHeaders,
  buildPrivateFileCacheHeaders,
  isEtagNotModified
} from '../src/utils/response.mjs';
import {
  clearReleaseSweepThrottle,
  expireOverdueReservedOrdersThrottled
} from '../src/services/order-release.mjs';
import {
  buildHomeDashboardCacheKey,
  clearHomeDashboardCache,
  getCachedHomeDashboardPayload,
  invalidateHomeDashboardCache,
  setCachedHomeDashboardPayload
} from '../src/services/home-dashboard-cache.mjs';
import { getProjectBoothOrdersMap } from '../src/services/booth-map-view.mjs';

function createReleaseSweepEnv(captured) {
  return {
    DB: {
      prepare(query) {
        captured.queries.push(String(query || ''));
        return {
          bind() {
            return this;
          },
          async all() {
            captured.allCalls += 1;
            return { results: [] };
          }
        };
      }
    }
  };
}

function createBoothOrderLookupEnv(captured) {
  return {
    DB: {
      prepare(query) {
        const sql = String(query || '');
        return {
          params: [],
          bind(...params) {
            this.params = params;
            return this;
          },
          async all() {
            captured.calls.push({ sql, params: [...this.params] });
            return { results: [] };
          }
        };
      }
    }
  };
}

async function runTests() {
  const htmlHeaders = buildAssetCacheHeaders('/');
  assert.equal(htmlHeaders['Cache-Control'], 'public, max-age=300, must-revalidate');
  assert.equal(htmlHeaders.Vary, 'Accept-Encoding');

  const jsHeaders = buildAssetCacheHeaders('/public/js/app.js');
  assert.equal(jsHeaders['Cache-Control'], 'public, max-age=3600, must-revalidate');
  assert.equal(jsHeaders.Vary, 'Accept-Encoding');

  const versionedCssHeaders = buildAssetCacheHeaders('/assets/tailwind.css?v=20260417-workbench-tabs-1');
  assert.equal(versionedCssHeaders['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(versionedCssHeaders.Vary, 'Accept-Encoding');

  const apiHeaders = buildPrivateApiCacheHeaders({ maxAge: 15, staleWhileRevalidate: 45 });
  assert.equal(apiHeaders['Cache-Control'], 'private, max-age=15, stale-while-revalidate=45');
  assert.equal(apiHeaders.Vary, 'Origin, Authorization');

  const fileHeaders = buildPrivateFileCacheHeaders({ maxAge: 120, immutable: false });
  assert.equal(fileHeaders['Cache-Control'], 'private, max-age=120');
  assert.equal(fileHeaders.Vary, 'Origin, Authorization, Accept-Encoding');

  clearHomeDashboardCache();
  const homeCacheKey = buildHomeDashboardCacheKey(7, { role: 'sales', name: '张三' }, '2026-04-01', '2026-04-30');
  setCachedHomeDashboardPayload(homeCacheKey, { totalSales: 12 }, 15_000, 1_000);
  assert.deepEqual(getCachedHomeDashboardPayload(homeCacheKey, 2_000), { totalSales: 12 });
  invalidateHomeDashboardCache(7);
  assert.equal(getCachedHomeDashboardPayload(homeCacheKey, 2_000), null);

  const otherProjectKey = buildHomeDashboardCacheKey(8, { role: 'admin', name: 'admin' });
  setCachedHomeDashboardPayload(otherProjectKey, { totalSales: 8 }, 15_000, 1_000);
  invalidateHomeDashboardCache(7);
  assert.deepEqual(getCachedHomeDashboardPayload(otherProjectKey, 2_000), { totalSales: 8 });
  clearHomeDashboardCache();

  const etagRequest = new Request('http://localhost/test', {
    headers: { 'If-None-Match': 'etag-123' }
  });
  assert.equal(isEtagNotModified(etagRequest, 'etag-123'), true);
  assert.equal(isEtagNotModified(etagRequest, 'etag-456'), false);

  const captured = { queries: [], allCalls: 0 };
  const env = createReleaseSweepEnv(captured);

  clearReleaseSweepThrottle();
  const firstResult = await expireOverdueReservedOrdersThrottled(env, 7, { throttleMs: 30_000 });
  assert.equal(firstResult.released_count, 0);
  assert.equal(captured.allCalls, 1);

  const secondResult = await expireOverdueReservedOrdersThrottled(env, 7, { throttleMs: 30_000 });
  assert.equal(secondResult.skipped, true);
  assert.equal(captured.allCalls, 1);

  clearReleaseSweepThrottle(7);
  const thirdResult = await expireOverdueReservedOrdersThrottled(env, 7, { throttleMs: 30_000 });
  assert.equal(thirdResult.released_count, 0);
  assert.equal(captured.allCalls, 2);

  const boothOrderCaptured = { calls: [] };
  const boothOrderEnv = createBoothOrderLookupEnv(boothOrderCaptured);
  await getProjectBoothOrdersMap(boothOrderEnv, 7, ['1A01', '1A02']);
  assert.equal(boothOrderCaptured.calls.length, 1);
  assert.ok(boothOrderCaptured.calls[0].sql.includes('INSTR('));
  assert.deepEqual(boothOrderCaptured.calls[0].params, [7, '1A01', '1A02']);

  clearReleaseSweepThrottle();
}

await runTests();
console.log('Performance cache helper tests passed');
