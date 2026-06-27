const { adjustStock } = require('./lib/stock');
const db = require('./db/connection');

try {
    // find a valid stock to adjust
    const existing = db.prepare(`SELECT * FROM stock_level sl JOIN batch b ON sl.batch_no = b.batch_no WHERE sl.quantity > 0 LIMIT 1`).get();
    if (existing) {
        console.log("Adjusting stock for:", existing);
        const result = adjustStock(existing.location_id, existing.product_id, existing.batch_no, 'Test note');
        console.log("Success:", result);
    } else {
        console.log("No stock found to adjust.");
    }
} catch (e) {
    console.error("Error:", e.message);
}
