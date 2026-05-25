import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const exhibitorConfirmHtml = readFileSync(new URL('../public/exhibitor-confirm.html', import.meta.url), 'utf8');

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
assert.ok(html.includes('id="dt-discount-reason-wrap"'), 'order detail should expose a commercial note container');
assert.ok(html.includes('id="dt-discount-reason"'), 'order detail should expose a commercial note value');
assert.ok(html.includes('id="dt-booth-change-history-wrap"'), 'order detail should expose a booth change history container');
assert.ok(html.includes('id="dt-booth-change-history-list"'), 'order detail should expose a booth change history list');
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
assert.ok(html.includes('onclick="window.downloadOrderCollectionTemplate()"'), 'order import pages should expose the external collection template download');
assert.ok(html.includes('./js/config.js?v=20260518-order-collection-template-1'), 'config.js version should be bumped for external collection template download support');
assert.ok(html.includes('id="lintel-filter-business-status"'), 'lintel panel should expose a business confirmation filter');
assert.ok(html.includes('id="lintel-filter-exhibition-status"'), 'lintel panel should expose an exhibition confirmation filter');
assert.ok(html.includes('id="lintel-filter-hall"'), 'lintel panel should expose a hall filter');
assert.ok(html.includes('id="lintel-filter-keyword"'), 'lintel panel should expose a booth or company keyword search');
assert.ok(html.includes('id="lintel-editor"'), 'lintel panel should expose a lintel editor modal');
assert.ok(html.includes('如有特殊要求请写明'), 'lintel editor should expose the remark guidance placeholder');
assert.ok(html.includes('id="confirmation-settings-reminder-milestones"'), 'confirmation settings should expose supplemental milestone copy');
assert.ok(html.includes('id="confirmation-settings-reminder-notes"'), 'confirmation settings should expose pre-submit reminder copy');
assert.ok(html.includes('id="confirmation-settings-submitted-reminder-notes"'), 'confirmation settings should expose submitted reminder copy');
assert.ok(html.includes('id="btn-generate-sales-brief"'), 'home hall dashboard should expose a sales brief generation button');
assert.ok(html.includes('id="sales-brief-modal"'), 'home dashboard should expose the sales brief modal');
assert.ok(html.includes('id="home-sales-brief-textarea"'), 'sales brief modal should expose a readonly brief textarea');
assert.ok(html.includes('value="lintel"'), 'booth map preview should expose a lintel-oriented filter mode');
assert.ok(html.includes('id="bm-filter-lintel-group"'), 'booth map preview should expose lintel preview filters');
assert.ok(!html.includes('./js/booth-map.js'), 'booth-map.js should not be eagerly loaded by index.html');
assert.ok(!html.includes('./js/finance.js'), 'finance.js should not be eagerly loaded by index.html');
assert.ok(!html.includes('./js/exhibition.js'), 'exhibition.js should not be eagerly loaded by index.html');
assert.ok(!html.includes('id="order-search" placeholder="搜公司/展位号..." class="border p-2 rounded text-sm w-48" onkeyup='), 'order list search should bind input events from finance.js');
assert.ok(exhibitorConfirmHtml.includes('entry-reminder-mask'), 'public exhibitor confirmation page should include the entry reminder modal shell');
assert.ok(exhibitorConfirmHtml.includes('buildEntryReminderDialog'), 'public exhibitor confirmation page should build the entry reminder dialog');
assert.ok(exhibitorConfirmHtml.includes('submitted_reminder_notes_text'), 'public exhibitor confirmation page should render submitted reminder copy');
assert.ok(exhibitorConfirmHtml.includes('calc(100dvh - 32px)'), 'entry reminder modal should constrain mobile viewport height');
assert.ok(exhibitorConfirmHtml.includes('class="required-badge"'), 'public exhibitor confirmation page should render explicit required badges');
assert.ok(exhibitorConfirmHtml.includes('本页必填'), 'public exhibitor confirmation page should summarize required fields');
assert.ok(exhibitorConfirmHtml.includes('可填写主营品类、核心产品、服务范围'), 'public exhibitor confirmation page should guide detailed product input');
assert.ok(exhibitorConfirmHtml.includes('可填写企业优势、产品卖点、供需对接信息'), 'public exhibitor confirmation page should guide profile input');
assert.ok(exhibitorConfirmHtml.includes('data-required-message'), 'public exhibitor confirmation page should attach inline required error copy');
assert.ok(exhibitorConfirmHtml.includes('还有 ${missingRequiredCount} 项必填未完成'), 'public exhibitor confirmation page should report missing required count');

console.log('Index layout tests passed');
