const db = require('./db/connection');

try {
  db.transaction(() => {
    // Remove the default pharmacy I added earlier
    const deleted = db.prepare(`DELETE FROM location WHERE name LIKE '%صيدلية العيادة الشمالية%' AND type = 'Pharmacy'`).run();
    console.log(`Removed ${deleted.changes} old pharmacy.`);

    // Add the user's specific pharmacies
    const insertPharmacy = db.prepare(`
      INSERT INTO location (name, type, address, max_capacity, importance_level)
      VALUES (?, 'Pharmacy', '', 5000, 4)
    `);

    const newPharmacies = [
      'ليلى١',
      'ليلى ٢',
      'البديع',
      'حوطة بني تميم',
      'القرنة (الدوادمي)',
      'الخرج'
    ];

    for (const pharmacy of newPharmacies) {
      insertPharmacy.run(pharmacy);
      console.log(`Added pharmacy: ${pharmacy}`);
    }
  })();
  console.log('Successfully updated pharmacies.');
} catch (err) {
  console.error('Failed to update pharmacies:', err);
}
