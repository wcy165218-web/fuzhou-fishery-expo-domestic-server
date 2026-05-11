import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  migrateR2ToLocal,
  parseListObjectsV2Xml,
  resolveLocalObjectPath
} from '../scripts/migrate-r2-to-local.mjs';

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function listXml(objects, { isTruncated = false, nextContinuationToken = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <IsTruncated>${isTruncated ? 'true' : 'false'}</IsTruncated>
  ${nextContinuationToken ? `<NextContinuationToken>${xmlEscape(nextContinuationToken)}</NextContinuationToken>` : ''}
  ${objects.map((object) => `
    <Contents>
      <Key>${xmlEscape(object.key)}</Key>
      <LastModified>${xmlEscape(object.lastModified || '2026-05-10T12:00:00.000Z')}</LastModified>
      <ETag>${xmlEscape(object.etag || '"etag-test"')}</ETag>
      <Size>${Number(object.body?.byteLength || Buffer.byteLength(String(object.body || '')))}</Size>
    </Contents>
  `).join('')}
</ListBucketResult>`;
}

{
  const parsed = parseListObjectsV2Xml(listXml([
    { key: 'contract_1.pdf', body: 'pdf' },
    { key: 'confirmation-banners/project_1.jpg', body: 'jpg', etag: '"jpg-etag"' }
  ], { isTruncated: true, nextContinuationToken: 'page&2' }));
  assert.equal(parsed.isTruncated, true);
  assert.equal(parsed.nextContinuationToken, 'page&2');
  assert.deepEqual(parsed.objects.map((object) => object.key), [
    'contract_1.pdf',
    'confirmation-banners/project_1.jpg'
  ]);
  assert.equal(parsed.objects[1].etag, '"jpg-etag"');
}

{
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'expo-r2-migration-'));
  const objects = [
    {
      key: 'contract_1.pdf',
      body: Buffer.from('%PDF local contract'),
      contentType: 'application/pdf',
      etag: '"contract-etag"'
    },
    {
      key: 'confirmation-banners/project_1.jpg',
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      contentType: 'image/jpeg',
      etag: '"banner-etag"'
    },
    {
      key: 'bad/../escape.pdf',
      body: Buffer.from('bad'),
      contentType: 'application/pdf',
      etag: '"bad-etag"'
    }
  ];
  const byKey = new Map(objects.map((object) => [object.key, object]));
  const fetchImpl = async (url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.searchParams.get('list-type') === '2') {
      return new Response(listXml(objects), { status: 200 });
    }
    const key = decodeURIComponent(parsedUrl.pathname.replace(/^\/expo-contracts\/?/, ''));
    const object = byKey.get(key);
    if (!object) return new Response('missing', { status: 404 });
    return new Response(object.body, {
      status: 200,
      headers: {
        etag: object.etag,
        'content-type': object.contentType,
        'cache-control': 'private, max-age=30'
      }
    });
  };

  try {
    const summary = await migrateR2ToLocal({
      endpoint: 'https://example.r2.test',
      bucket: 'expo-contracts',
      rootDir,
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key'
      },
      fetchImpl,
      concurrency: 2,
      sampleSize: 1
    });

    assert.equal(summary.listedCount, 3);
    assert.equal(summary.migratedCount, 2);
    assert.equal(summary.failedKeys.length, 1);
    assert.match(summary.failedKeys[0].error, /path traversal/);
    assert.equal(summary.localObjectCount, 2);
    assert.equal(summary.sampleVerified.length, 1);

    const contractPath = resolveLocalObjectPath(rootDir, 'contract_1.pdf');
    assert.equal(await fs.readFile(contractPath, 'utf8'), '%PDF local contract');
    const contractMeta = JSON.parse(await fs.readFile(`${contractPath}.meta.json`, 'utf8'));
    assert.equal(contractMeta.httpEtag, '"contract-etag"');
    assert.deepEqual(contractMeta.httpMetadata, {
      contentType: 'application/pdf',
      cacheControl: 'private, max-age=30'
    });
    assert.equal(contractMeta.source.provider, 'cloudflare-r2');
    assert.equal(contractMeta.source.bucket, 'expo-contracts');

    const bannerPath = resolveLocalObjectPath(rootDir, 'confirmation-banners/project_1.jpg');
    const bannerMeta = JSON.parse(await fs.readFile(`${bannerPath}.meta.json`, 'utf8'));
    assert.equal(bannerMeta.httpMetadata.contentType, 'image/jpeg');

    await assert.rejects(
      fs.access(path.join(rootDir, '..', 'escape.pdf')),
      /ENOENT/
    );
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

console.log('R2 migration script tests passed');
