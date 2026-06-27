const fs = require('fs');
let content = fs.readFileSync('public/app.js', 'utf8');

const escapeFn = `function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

`;

if (!content.includes('function escapeHTML')) {
  content = escapeFn + content;
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.name\}/g, '${escapeHTML($1.name)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.product_name\}/g, '${escapeHTML($1.product_name)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.category\}/g, '${escapeHTML($1.category)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.reference_note\}/g, '${escapeHTML($1.reference_note)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.from_name\}/g, '${escapeHTML($1.from_name)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.to_name\}/g, '${escapeHTML($1.to_name)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.location_name\}/g, '${escapeHTML($1.location_name)}');
  content = content.replace(/\$\{([a-zA-Z0-9_]+)\.supplier_name\}/g, '${escapeHTML($1.supplier_name)}');
  fs.writeFileSync('public/app.js', content);
  console.log('XSS mitigation applied to app.js');
} else {
  console.log('Already applied.');
}
