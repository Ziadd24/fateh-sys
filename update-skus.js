const db = require('./db/connection');

const products = db.prepare('SELECT product_id, name FROM product').all();
const updateSku = db.prepare('UPDATE product SET sku = ? WHERE product_id = ?');

db.transaction(() => {
  for (const p of products) {
    const newSku = Math.random().toString(36).substring(2, 6).toUpperCase();
    updateSku.run(newSku, p.product_id);
    console.log(`Updated "${p.name}" to short SKU: ${newSku}`);
  }
})();

console.log('Successfully updated existing medicines with short SKUs.');
