import { readFileSync } from 'node:fs';

const indexPath = new URL('../public/index.html', import.meta.url);
const html = readFileSync(indexPath, 'utf8');

function fail(message) {
  console.error(`[guard:static-root] ${message}`);
  process.exit(1);
}

if (!html.includes('id="login-view"') || !html.includes('id="main-view"')) {
  fail('public/index.html is not the ERP login shell; aborting deploy');
}

if (/ICP备案|备案页|public-site-shell|id="public-site"|class="public-site/.test(html)) {
  fail('public/index.html looks like the public/ICP page; aborting deploy');
}

console.log('[guard:static-root] public/index.html is the ERP login shell');
