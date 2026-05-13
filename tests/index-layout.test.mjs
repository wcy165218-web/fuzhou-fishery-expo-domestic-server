import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function findMainContentCloseIndex(source) {
  const mainOpen = source.match(/<div\b[^>]*\bid=["']main-content["'][^>]*>/i);
  assert.ok(mainOpen, 'index.html should contain #main-content');

  const start = mainOpen.index + mainOpen[0].length;
  const divTagPattern = /<\/?div\b[^>]*>/gi;
  divTagPattern.lastIndex = start;

  let depth = 1;
  let match;
  while ((match = divTagPattern.exec(source))) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }

  assert.fail('#main-content closing </div> was not found');
}

const mainCloseIndex = findMainContentCloseIndex(html);
const expectedSections = [
  'sec-home',
  'sec-config',
  'sec-exhibition',
  'sec-booth-map',
  'sec-booth',
  'sec-agents',
  'sec-order-entry',
  'sec-order-list'
];

for (const sectionId of expectedSections) {
  const sectionIndex = html.indexOf(`id="${sectionId}"`);
  assert.ok(sectionIndex >= 0, `${sectionId} should exist in index.html`);
  assert.ok(
    sectionIndex < mainCloseIndex,
    `${sectionId} should stay inside #main-content; check for an extra closing </div> before it`
  );
}

assert.ok(html.includes('id="order-region-search"'), 'closed order list should expose a region filter input');
assert.ok(html.includes('id="order-booth-type-filter"'), 'closed order list should expose a booth type filter');
assert.ok(html.includes('order-compact-actions-cell'), 'closed order list should expose a compact sticky action column');
assert.ok(!html.includes('id="order-action-toolbar"'), 'closed order list should no longer render the shared action toolbar');
assert.ok(html.includes('id="btn-refrigerator-rental-mode-no-booth"'), 'refrigerator rental modal should expose a no-booth mode toggle');
assert.ok(html.includes('id="refrigerator-company-manual-shell"'), 'refrigerator rental modal should expose a manual no-booth input shell');
assert.ok(html.includes('这里才是真正可输入的搜索框'), 'refrigerator rental modal should clearly distinguish the search input area');
assert.ok(html.includes('id="exhibition-manager-name"'), 'exhibition project settings should expose an exhibition manager name input');
assert.ok(html.includes('id="exhibition-manager-list-tbody"'), 'exhibition project settings should expose an exhibition manager list');
assert.ok(html.includes('id="btn-export-exhibitor-directory-list"'), 'exhibitor directory should expose an Excel list export button');
assert.ok(html.includes('id="lintel-table-wrap"'), 'lintel panel should expose a lintel table container');
assert.ok(html.includes('id="btn-lintel-batch-confirm"'), 'lintel panel should expose a batch confirm button');
assert.ok(html.includes('id="btn-export-lintels"'), 'lintel panel should expose a lintel export button');
assert.ok(html.includes('id="lintel-filter-business-status"'), 'lintel panel should expose a business confirmation filter');
assert.ok(html.includes('id="lintel-filter-exhibition-status"'), 'lintel panel should expose an exhibition confirmation filter');
assert.ok(html.includes('id="lintel-filter-hall"'), 'lintel panel should expose a hall filter');
assert.ok(html.includes('id="lintel-filter-keyword"'), 'lintel panel should expose a booth or company keyword search');
assert.ok(html.includes('id="lintel-editor"'), 'lintel panel should expose a lintel editor modal');
assert.ok(html.includes('如有特殊要求请写明'), 'lintel editor should expose the remark guidance placeholder');
assert.ok(html.includes('value="lintel"'), 'booth map preview should expose a lintel-oriented filter mode');
assert.ok(html.includes('id="bm-filter-lintel-group"'), 'booth map preview should expose lintel preview filters');
assert.ok(!html.includes('./js/booth-map.js'), 'booth-map.js should not be eagerly loaded by index.html');
assert.ok(!html.includes('./js/finance.js'), 'finance.js should not be eagerly loaded by index.html');
assert.ok(!html.includes('./js/exhibition.js'), 'exhibition.js should not be eagerly loaded by index.html');
assert.ok(!html.includes('id="order-search" placeholder="搜公司/展位号..." class="border p-2 rounded text-sm w-48" onkeyup='), 'order list search should bind input events from finance.js');

console.log('Index layout tests passed');
