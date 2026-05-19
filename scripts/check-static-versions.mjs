import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const filesToCheck = [
    'public/index.html',
    'public/js/auth.js'
];

function collectVersionlessLocalAssets(filePath, source) {
    const matches = [];
    const assetPattern = /["'`](\.\/)?(?:js|assets)\/[^"'`?]+\.(?:js|css)(?!\?v=)/g;
    let match;
    while ((match = assetPattern.exec(source))) {
        matches.push({ filePath, value: match[0].slice(1) });
    }
    return matches;
}

const versionlessAssets = filesToCheck.flatMap((filePath) => {
    const source = readFileSync(new URL(`../${filePath}`, import.meta.url), 'utf8');
    return collectVersionlessLocalAssets(filePath, source);
});

assert.deepEqual(
    versionlessAssets,
    [],
    `Local static JS/CSS references must include ?v= for immutable cache safety: ${JSON.stringify(versionlessAssets)}`
);

const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../public/js/auth.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const featureVersion = authSource.match(/const FEATURE_SCRIPT_VERSION = '([^']+)'/)?.[1];

assert.ok(featureVersion, 'auth.js should define FEATURE_SCRIPT_VERSION for lazy feature bundles');
assert.ok(
    indexHtml.includes(`./js/auth.js?v=${featureVersion}`),
    'index.html auth.js version should match auth.js FEATURE_SCRIPT_VERSION'
);
assert.ok(
    indexHtml.includes(`./js/app.js?v=${featureVersion}`),
    'index.html app.js version should match auth.js FEATURE_SCRIPT_VERSION'
);
assert.ok(
    appSource.includes(`./js/auth.js?v=${featureVersion}`),
    'app.js login fallback should load auth.js with the current FEATURE_SCRIPT_VERSION'
);

console.log('Static asset version checks passed');
