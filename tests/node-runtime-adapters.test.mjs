import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKVCache } from '../src/adapter/cache.mjs';
import { installRuntimeShims } from '../src/adapter/runtime-shims.mjs';
import { createLocalStorageBucket } from '../src/adapter/storage.mjs';
import { handleFileRoutes } from '../src/routes/files.mjs';

function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'expo-node-runtime-'));
}

async function readResponseText(response) {
  return new TextDecoder().decode(await response.arrayBuffer());
}

{
  const rootDir = await createTempDir();
  const bucket = createLocalStorageBucket({ rootDir });
  try {
    await bucket.put('contracts/contract_test.pdf', 'contract body', {
      httpMetadata: {
        contentType: 'application/pdf',
        cacheControl: 'private, max-age=30'
      }
    });

    const object = await bucket.get('contracts/contract_test.pdf');
    assert.ok(object);
    assert.equal(await readResponseText(new Response(object.body)), 'contract body');
    assert.match(object.httpEtag, /^"[a-f0-9]{64}"$/);
    assert.deepEqual(object.httpMetadata, {
      contentType: 'application/pdf',
      cacheControl: 'private, max-age=30'
    });
    assert.equal(
      new TextDecoder().decode(await object.arrayBuffer()),
      'contract body'
    );

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    assert.equal(headers.get('Content-Type'), 'application/pdf');
    assert.equal(headers.get('Cache-Control'), 'private, max-age=30');

    const sidecar = JSON.parse(await fs.readFile(path.join(rootDir, 'contracts/contract_test.pdf.meta.json'), 'utf8'));
    assert.equal(sidecar.httpMetadata.contentType, 'application/pdf');

    await assert.rejects(bucket.put('', 'x'), /empty/);
    await assert.rejects(bucket.put('/absolute.pdf', 'x'), /absolute/);
    await assert.rejects(bucket.put('../escape.pdf', 'x'), /traversal/);
    await assert.rejects(bucket.put('nested/../../escape.pdf', 'x'), /traversal/);

    await bucket.delete('contracts/contract_test.pdf');
    assert.equal(await bucket.get('contracts/contract_test.pdf'), null);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

{
  const cache = createKVCache();
  await cache.put('rate:alice', JSON.stringify({ count: 2 }), { expirationTtl: 60 });
  assert.deepEqual(await cache.get('rate:alice', 'json'), { count: 2 });
  await cache.put('plain', 'ok');
  assert.equal(await cache.get('plain'), 'ok');
  await cache.delete('plain');
  assert.equal(await cache.get('plain'), null);

  const expiring = createKVCache();
  await expiring.put('short', 'gone', { expirationTtl: 1 });
  assert.equal(await expiring.get('short'), 'gone');
}

{
  const previousCaches = globalThis.caches;
  delete globalThis.caches;
  try {
    installRuntimeShims();
    assert.equal(typeof globalThis.caches.default.match, 'function');
    const request = new Request('http://localhost/api/booth-map-asset/bg.png?mapId=1');
    const response = new Response('cached body', {
      status: 201,
      statusText: 'Created',
      headers: {
        etag: '"asset-1"',
        'Content-Type': 'image/png'
      }
    });
    await globalThis.caches.default.put(request, response);
    const cached = await globalThis.caches.default.match(request);
    assert.equal(cached.status, 201);
    assert.equal(cached.statusText, 'Created');
    assert.equal(cached.headers.get('etag'), '"asset-1"');
    assert.equal(await cached.text(), 'cached body');
    assert.equal(await globalThis.caches.default.delete(request), true);
    assert.equal(await globalThis.caches.default.match(request), undefined);
  } finally {
    if (previousCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = previousCaches;
    }
  }
}

{
  const rootDir = await createTempDir();
  const bucket = createLocalStorageBucket({ rootDir });
  let storedKey = '';
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async first() {
            if (sql.includes('FROM Orders')) {
              return {
                sales_name: 'admin',
                contract_url: storedKey,
                company_name: '福州测试展商',
                booth_id: 'A01',
                project_id: 7
              };
            }
            if (sql.includes('FROM Booths')) {
              return { hall: '1号馆' };
            }
            return null;
          }
        };
      }
    },
    BUCKET: bucket
  };
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://localhost'
  };

  try {
    const uploadRequest = new Request('http://localhost/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uploadId: 'contracttest1',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 local contract').toString('base64')
      })
    });
    const uploadResponse = await handleFileRoutes({
      request: uploadRequest,
      env,
      url: new URL(uploadRequest.url),
      currentUser: { role: 'admin', name: 'admin' },
      corsHeaders
    });
    assert.equal(uploadResponse.status, 200);
    const uploadPayload = await uploadResponse.json();
    assert.equal(uploadPayload.success, true);
    assert.equal(uploadPayload.fileKey, 'contract_contracttest1.pdf');
    storedKey = uploadPayload.fileKey;

    const firstDownloadRequest = new Request(`http://localhost/api/file/${storedKey}?orderId=101`);
    const firstDownload = await handleFileRoutes({
      request: firstDownloadRequest,
      env,
      url: new URL(firstDownloadRequest.url),
      currentUser: { role: 'admin', name: 'admin' },
      corsHeaders
    });
    assert.equal(firstDownload.status, 200);
    const etag = firstDownload.headers.get('etag');
    assert.match(etag, /^"[a-f0-9]{64}"$/);
    assert.equal(firstDownload.headers.get('Content-Type'), 'application/pdf');
    assert.equal(await readResponseText(firstDownload), '%PDF-1.4 local contract');

    const notModifiedRequest = new Request(`http://localhost/api/file/${storedKey}?orderId=101`, {
      headers: { 'If-None-Match': etag }
    });
    const notModified = await handleFileRoutes({
      request: notModifiedRequest,
      env,
      url: new URL(notModifiedRequest.url),
      currentUser: { role: 'admin', name: 'admin' },
      corsHeaders
    });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('etag'), etag);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

console.log('Node runtime adapter tests passed');
