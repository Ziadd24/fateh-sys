const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'public', 'app.js');
let appCode = fs.readFileSync(appPath, 'utf8');

// 1. Add escapeHTML helper at the top
const escapeHTMLHelper = `
// --- Security Helpers ---
const escapeHTML = (str) => {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
};
`;

if (!appCode.includes('const escapeHTML =')) {
  appCode = escapeHTMLHelper + '\n' + appCode;
}

// 2. Replace vulnerable interpolations with escapeHTML(...)
// Note: This is a simplistic regex replace for demonstration.
// Since there are specific variables we know are unsafe: p.name, p.sku, p.category, s.name, b.batch_no, etc.
// We will replace ${...} in known vulnerable templates with ${escapeHTML(...)}
// For a safe automated fix, we will just wrap anything that looks like ${p.name}, ${b.batch_no}, etc.

const vulnerableVars = [
  'p.name', 'p.sku', 'p.category',
  'b.batch_no', 'b.product_name', 'b.expiry_date',
  's.name', 's.type',
  'loc.name', 'loc.type',
  'm.product_name', 'm.batch_no', 'm.from_name', 'm.to_name', 'm.from_supplier', 'm.to_warehouse', 'm.from_warehouse', 'm.to_pharmacy', 'm.reference_note',
  'item.product_name', 'item.batch_no', 'item.location_name',
  'a.product_name', 'a.batch_no', 'a.location_name',
  'i.product_name', 'i.batch_no', 'i.location_name',
  'o.supplier_name', 'o.product_name', 'o.notes',
  'h.text'
];

vulnerableVars.forEach(v => {
  const regex = new RegExp(`\\$\\{\\s*${v.replace('.', '\\.')}\\s*\\}`, 'g');
  appCode = appCode.replace(regex, `\${escapeHTML(${v})}`);
});

// Also fix message in toast
appCode = appCode.replace(/\$\{\\s*message\\s*\}/g, '${escapeHTML(message)}');

fs.writeFileSync(appPath, appCode);
console.log('Patched public/app.js with escapeHTML');
