import { findViolationsInDir } from '../src/lib/cdnCheck.ts';

const violations = findViolationsInDir(new URL('../dist', import.meta.url).pathname);
if (violations.length === 0) {
  console.log('dist/: no external network URLs');
  process.exit(0);
}
violations.slice(0, 30).forEach((item) => {
  console.error(`${item.file}: ${item.url}`);
});
console.error(`${violations.length} external URL(s) in dist/`);
process.exit(1);
