const fs = require('fs');
const path = require('path');
const db = require('./db/connection');

const jsonPath = path.join(__dirname, 'data', 'vet-meds.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const medicines = JSON.parse(rawData);

const insertProduct = db.prepare(`
  INSERT INTO product (sku, name, category, unit_cost, storage_condition)
  VALUES (?, ?, ?, ?, ?)
`);

db.transaction(() => {
  for (const med of medicines) {
    // Generate dynamic SKU, just like the API does
    const sku = Math.floor(10000000 + Math.random() * 90000000).toString();
    insertProduct.run(sku, med.name, med.category, med.unit_cost, med.storage_condition);
    console.log(`Added: ${med.name} (SKU: ${sku})`);
  }
})();

console.log(`\nSuccessfully imported ${medicines.length} medicines into the system without hardcoding.`);
