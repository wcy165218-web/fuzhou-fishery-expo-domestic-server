#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const DEFAULT_BUCKET = 'expo-contracts';
const DEFAULT_STORAGE_ROOT = '/var/expo-files';
const DEFAULT_CONCURRENCY = 4;

function encodeRfc3986(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeS3PathSegment(value) {
  return String(value).split('/').map(encodeRfc3986).join('/');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function formatAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalizeQuery(searchParams) {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey === rightKey ? String(leftValue).localeCompare(String(rightValue)) : String(leftKey).localeCompare(String(rightKey))
    ))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function buildSignedHeaders({ method, url, accessKeyId, secretAccessKey, region = 'auto', service = 's3', now = new Date() }) {
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256('');
  const lowerHeaders = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  const signedHeaderNames = Object.keys(lowerHeaders).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${lowerHeaders[name]}\n`).join('');
  const canonicalRequest = [
    method,
    url.pathname.split('/').map((part) => encodeRfc3986(decodeURIComponent(part))).join('/'),
    canonicalizeQuery(url.searchParams),
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service),
    'aws4_request'
  );
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
}

function decodeXmlValue(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function firstXmlValue(block, tagName) {
  const match = String(block).match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXmlValue(match[1]) : '';
}

export function parseListObjectsV2Xml(xmlText) {
  const contents = Array.from(String(xmlText).matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)).map((match) => {
    const block = match[1];
    return {
      key: firstXmlValue(block, 'Key'),
      size: Number(firstXmlValue(block, 'Size') || 0),
      etag: firstXmlValue(block, 'ETag'),
      lastModified: firstXmlValue(block, 'LastModified')
    };
  }).filter((object) => object.key);

  return {
    objects: contents,
    isTruncated: firstXmlValue(xmlText, 'IsTruncated') === 'true',
    nextContinuationToken: firstXmlValue(xmlText, 'NextContinuationToken')
  };
}

function assertSafeStorageKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) throw new Error('Storage key must not be empty');
  if (path.isAbsolute(normalized)) throw new Error('Storage key must not be absolute');
  if (normalized.split(/[\\/]+/).some((part) => part === '..')) {
    throw new Error('Storage key must not contain path traversal');
  }
  return normalized;
}

export function resolveLocalObjectPath(rootDir, key) {
  const safeKey = assertSafeStorageKey(key);
  const root = path.resolve(rootDir);
  const objectPath = path.resolve(root, safeKey);
  const relative = path.relative(root, objectPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Storage key escapes root directory');
  }
  return objectPath;
}

function httpMetadataFromHeaders(headers) {
  const pairs = [
    ['contentType', 'content-type'],
    ['contentLanguage', 'content-language'],
    ['contentDisposition', 'content-disposition'],
    ['contentEncoding', 'content-encoding'],
    ['cacheControl', 'cache-control']
  ];
  return Object.fromEntries(
    pairs
      .map(([metadataKey, headerKey]) => [metadataKey, headers.get(headerKey)])
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([key, value]) => [key, String(value)])
  );
}

async function fetchR2({ method, endpoint, bucket, key = '', query = {}, credentials, fetchImpl }) {
  const url = new URL(`${endpoint.replace(/\/+$/, '')}/${encodeRfc3986(bucket)}${key ? `/${encodeS3PathSegment(key)}` : ''}`);
  Object.entries(query || {}).forEach(([queryKey, queryValue]) => {
    if (queryValue !== undefined && queryValue !== null && queryValue !== '') {
      url.searchParams.set(queryKey, String(queryValue));
    }
  });
  const headers = buildSignedHeaders({
    method,
    url,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    region: credentials.region || 'auto'
  });
  return fetchImpl(url, { method, headers });
}

async function listR2Objects(options) {
  const objects = [];
  let continuationToken = '';
  do {
    const response = await fetchR2({
      ...options,
      method: 'GET',
      query: {
        'list-type': '2',
        'max-keys': 1000,
        prefix: options.prefix || '',
        'continuation-token': continuationToken
      }
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`R2 list failed with HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
    }
    const page = parseListObjectsV2Xml(bodyText);
    objects.push(...page.objects);
    continuationToken = page.isTruncated ? page.nextContinuationToken : '';
  } while (continuationToken);
  return objects;
}

async function writeObjectAndMetadata({
  rootDir,
  bucket,
  object,
  bodyBuffer,
  responseHeaders,
  dryRun
}) {
  const objectPath = resolveLocalObjectPath(rootDir, object.key);
  if (dryRun) {
    return {
      key: object.key,
      bytes: Number(object.size || bodyBuffer?.byteLength || 0),
      objectPath
    };
  }

  await fs.mkdir(path.dirname(objectPath), { recursive: true });
  const tempPath = `${objectPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await fs.writeFile(tempPath, bodyBuffer);
  await fs.rename(tempPath, objectPath);

  const etag = String(responseHeaders.get('etag') || object.etag || '').trim();
  const metadata = {
    httpEtag: etag || `"${sha256(bodyBuffer)}"`,
    httpMetadata: httpMetadataFromHeaders(responseHeaders),
    size: bodyBuffer.byteLength,
    uploaded: new Date().toISOString(),
    source: {
      provider: 'cloudflare-r2',
      bucket,
      key: object.key,
      etag: object.etag || '',
      lastModified: object.lastModified || '',
      listedSize: Number(object.size || 0)
    }
  };
  await fs.writeFile(`${objectPath}.meta.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  return {
    key: object.key,
    bytes: bodyBuffer.byteLength,
    objectPath
  };
}

async function migrateOneObject({ object, context }) {
  resolveLocalObjectPath(context.rootDir, object.key);
  if (context.dryRun) {
    return writeObjectAndMetadata({
      rootDir: context.rootDir,
      bucket: context.bucket,
      object,
      bodyBuffer: Buffer.alloc(0),
      responseHeaders: new Headers(),
      dryRun: true
    });
  }
  const response = await fetchR2({
    method: 'GET',
    endpoint: context.endpoint,
    bucket: context.bucket,
    key: object.key,
    credentials: context.credentials,
    fetchImpl: context.fetchImpl
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`R2 get failed with HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const bodyBuffer = Buffer.from(await response.arrayBuffer());
  return writeObjectAndMetadata({
    rootDir: context.rootDir,
    bucket: context.bucket,
    object,
    bodyBuffer,
    responseHeaders: response.headers,
    dryRun: context.dryRun
  });
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency || DEFAULT_CONCURRENCY), Math.max(items.length, 1)));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }));
  return results;
}

async function countLocalObjects(rootDir) {
  let count = 0;
  async function visit(directory) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (!entry.name.endsWith('.meta.json')) {
        count += 1;
      }
    }
  }
  await visit(rootDir);
  return count;
}

async function verifySample({ objects, context, sampleSize }) {
  const size = Math.max(0, Math.min(Number(sampleSize || 0), objects.length));
  if (!size || context.dryRun) return [];
  const sample = [...objects]
    .sort((left, right) => sha256(`${left.key}\0sample`).localeCompare(sha256(`${right.key}\0sample`)))
    .slice(0, size);
  return Promise.all(sample.map(async (object) => {
    const objectPath = resolveLocalObjectPath(context.rootDir, object.key);
    const localBuffer = await fs.readFile(objectPath);
    const response = await fetchR2({
      method: 'GET',
      endpoint: context.endpoint,
      bucket: context.bucket,
      key: object.key,
      credentials: context.credentials,
      fetchImpl: context.fetchImpl
    });
    if (!response.ok) {
      throw new Error(`R2 sample get failed for ${object.key} with HTTP ${response.status}`);
    }
    const remoteBuffer = Buffer.from(await response.arrayBuffer());
    const localHash = sha256(localBuffer);
    const remoteHash = sha256(remoteBuffer);
    if (localHash !== remoteHash) {
      throw new Error(`Sample verification hash mismatch for ${object.key}`);
    }
    return {
      key: object.key,
      bytes: localBuffer.byteLength,
      sha256: localHash
    };
  }));
}

export async function migrateR2ToLocal({
  endpoint,
  accountId,
  bucket = DEFAULT_BUCKET,
  rootDir = DEFAULT_STORAGE_ROOT,
  prefix = '',
  credentials,
  concurrency = DEFAULT_CONCURRENCY,
  dryRun = false,
  sampleSize = 0,
  fetchImpl = globalThis.fetch
}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const resolvedEndpoint = endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!resolvedEndpoint) throw new Error('Missing R2 endpoint or Cloudflare account id');
  if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
    throw new Error('Missing R2 S3 credentials');
  }

  const context = {
    endpoint: resolvedEndpoint,
    bucket,
    rootDir,
    credentials,
    fetchImpl,
    dryRun
  };
  const startedAt = new Date();
  const objects = await listR2Objects({
    endpoint: resolvedEndpoint,
    bucket,
    prefix,
    credentials,
    fetchImpl
  });
  const failed = [];
  let byteCount = 0;
  let migratedCount = 0;

  await runWithConcurrency(objects, concurrency, async (object) => {
    try {
      const result = await migrateOneObject({ object, context });
      byteCount += Number(result.bytes || 0);
      migratedCount += 1;
      return result;
    } catch (error) {
      failed.push({
        key: object.key,
        error: String(error?.message || error)
      });
      return null;
    }
  });

  const sample = await verifySample({
    objects: objects.filter((object) => !failed.some((entry) => entry.key === object.key)),
    context,
    sampleSize
  });
  const localObjectCount = dryRun ? null : await countLocalObjects(rootDir);

  return {
    bucket,
    rootDir,
    prefix,
    dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    listedCount: objects.length,
    migratedCount,
    byteCount,
    failedKeys: failed,
    localObjectCount,
    sampleVerified: sample
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawName, inlineValue] = arg.slice(2).split('=', 2);
    const name = rawName.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    if (['dryRun', 'help'].includes(name)) {
      options[name] = true;
    } else {
      options[name] = inlineValue ?? argv[index + 1];
      if (inlineValue === undefined) index += 1;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/migrate-r2-to-local.mjs --bucket expo-contracts --root /var/expo-files

Required credentials:
  CF_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID
  R2_ACCESS_KEY_ID or CLOUDFLARE_R2_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY or CLOUDFLARE_R2_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY

Options:
  --env-file <path>       Load env vars before running
  --endpoint <url>        Override R2 S3 endpoint
  --bucket <name>         R2 bucket name, defaults to ${DEFAULT_BUCKET}
  --root <path>           Local storage root, defaults to ${DEFAULT_STORAGE_ROOT}
  --prefix <prefix>       Only migrate keys with this prefix
  --concurrency <number>  Parallel downloads, defaults to ${DEFAULT_CONCURRENCY}
  --sample-size <number>  Re-download deterministic sample and hash-verify it
  --summary <path>        Write migration summary JSON
  --dry-run               List and validate without writing files
`);
}

function readWranglerAccountId() {
  return fs.readFile('wrangler.toml', 'utf8')
    .then((text) => String(text).match(/^\s*CF_ACCOUNT_ID\s*=\s*"([^"]+)"/m)?.[1] || '')
    .catch(() => '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.envFile) dotenv.config({ path: args.envFile, override: true });
  dotenv.config();

  const accountId = args.accountId
    || process.env.CF_ACCOUNT_ID
    || process.env.CLOUDFLARE_ACCOUNT_ID
    || await readWranglerAccountId();
  const bucket = args.bucket || process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || DEFAULT_BUCKET;
  const rootDir = args.root || process.env.FILE_STORAGE_ROOT || DEFAULT_STORAGE_ROOT;
  const summary = await migrateR2ToLocal({
    endpoint: args.endpoint || process.env.R2_ENDPOINT || '',
    accountId,
    bucket,
    rootDir,
    prefix: args.prefix || process.env.R2_PREFIX || '',
    credentials: {
      accessKeyId: args.accessKeyId || process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: args.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
      region: args.region || process.env.R2_REGION || process.env.AWS_REGION || 'auto'
    },
    concurrency: Number(args.concurrency || process.env.R2_MIGRATION_CONCURRENCY || DEFAULT_CONCURRENCY),
    dryRun: Boolean(args.dryRun),
    sampleSize: Number(args.sampleSize || process.env.R2_MIGRATION_SAMPLE_SIZE || 0)
  });

  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  if (args.summary) {
    await fs.mkdir(path.dirname(path.resolve(args.summary)), { recursive: true });
    await fs.writeFile(args.summary, summaryText);
  }
  process.stdout.write(summaryText);
  if (summary.failedKeys.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`R2 migration failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
