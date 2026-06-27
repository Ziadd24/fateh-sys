const db = require('./db/connection');

try {
  db.transaction(() => {
    // Add a Warehouse
    db.prepare(`
      INSERT INTO location (name, type, address, max_capacity, importance_level)
      VALUES ('المستودع الرئيسي', 'Warehouse', 'المنطقة المركزية', 500000, 5)
    `).run();

    // Add a Supplier
    db.prepare(`
      INSERT INTO location (name, type, address, max_capacity, importance_level)
      VALUES ('الشركة العالمية للأدوية البيطرية', 'Supplier', 'الرياض', 0, 5)
    `).run();
    
    // Add a Pharmacy
    db.prepare(`
      INSERT INTO location (name, type, address, max_capacity, importance_level)
      VALUES ('صيدلية العيادة الشمالية', 'Pharmacy', 'فرع الشمال', 5000, 4)
    `).run();
  })();
  console.log('Successfully added default locations.');
} catch (err) {
  console.error('Failed to add locations:', err);
}
