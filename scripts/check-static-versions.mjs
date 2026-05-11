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

console.log('Static asset version checks passed');