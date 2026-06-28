const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET /api/analytics/dashboard - High-level KPIs
router.get('/dashboard', (req, res) => {
    // 1. Pharmacies
    const activePharmacies = db.prepare("SELECT COUNT(*) as count FROM location WHERE type = 'Pharmacy' AND is_active = 1").get().count;
    const monthlyTransfers = db.prepare(`
        SELECT COUNT(*) as count 
        FROM stock_movement 
        WHERE movement = 'TRANSFER' 
          AND created_at >= date('now', '-30 days')
    `).get().count;

    // 2. Warehouse
    const warehouseStockRow = db.prepare(`
        SELECT 
            SUM(sl.quantity) as volume,
            SUM(sl.quantity * p.unit_cost) as total_value
        FROM stock_level sl
        JOIN location l ON sl.location_id = l.location_id
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE l.type = 'Warehouse'
    `).get();
    
    const warehouseCapacityRow = db.prepare("SELECT SUM(max_capacity) as max_cap FROM location WHERE type = 'Warehouse'").get();
    
    const warehouseStock = warehouseStockRow.volume || 0;
    const warehouseTotalValue = warehouseStockRow.total_value || 0;
    const warehouseMaxCapacity = warehouseCapacityRow.max_cap || 1;
    const warehouseCapacityPercent = warehouseMaxCapacity > 0 ? Math.round((warehouseStock / warehouseMaxCapacity) * 100) : 0;

    // 3. Importers
    const activeImporters = db.prepare("SELECT COUNT(*) as count FROM location WHERE type = 'Supplier' AND is_active = 1").get().count;
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM order_request WHERE status = 'PENDING'").get().count;
    
    const topImporterRow = db.prepare(`
        SELECT l.name, AVG(o.accuracy_score) as avg_score
        FROM order_request o
        JOIN location l ON o.supplier_id = l.location_id
        WHERE o.status = 'FULFILLED' AND o.accuracy_score IS NOT NULL AND l.is_active = 1
        GROUP BY l.location_id
        ORDER BY avg_score DESC
        LIMIT 1
    `).get();
    const topImporter = topImporterRow ? topImporterRow.name : '—';
    
    const costSavingsRow = db.prepare(`
        SELECT SUM(max_p - min_p) as savings
        FROM (
            SELECT so.product_id, MAX(so.price) as max_p, MIN(so.price) as min_p
            FROM supplier_offer so
            JOIN location l ON so.supplier_id = l.location_id AND l.is_active = 1
            GROUP BY so.product_id
            HAVING COUNT(so.supplier_id) > 1
        )
    `).get();
    const costSavings = costSavingsRow && costSavingsRow.savings ? costSavingsRow.savings : 0;

    const totalMedicinesCovered = db.prepare(`
        SELECT COUNT(DISTINCT so.product_id) as count 
        FROM supplier_offer so 
        JOIN location l ON so.supplier_id = l.location_id AND l.is_active = 1
    `).get().count;

    const medicinesWithNoImporter = db.prepare(`
        SELECT COUNT(*) as orphaned
        FROM product p
        WHERE NOT EXISTS (
            SELECT 1 FROM supplier_offer so 
            JOIN location l ON so.supplier_id = l.location_id AND l.is_active = 1
            WHERE so.product_id = p.product_id
        )
    `).get().orphaned;

    // 4. Medicines
    const totalSKUs = db.prepare("SELECT COUNT(*) as count FROM product").get().count;
    const lowStockAlerts = db.prepare("SELECT COUNT(*) as count FROM vw_low_stock").get().count;
    const expiringBatches = db.prepare("SELECT COUNT(*) as count FROM vw_near_expiry").get().count;

    // Critical Alerts: expired batches still in stock + products with zero total stock
    const expiredCount = db.prepare(`
        SELECT COUNT(DISTINCT b.batch_no) as count
        FROM batch b
        JOIN stock_level sl ON sl.batch_no = b.batch_no
        WHERE b.expiry_date < date('now') AND sl.quantity > 0
    `).get().count;
    const outOfStockCount = db.prepare(`
        SELECT COUNT(*) as count FROM product p
        WHERE NOT EXISTS (
            SELECT 1 FROM batch b
            JOIN stock_level sl ON sl.batch_no = b.batch_no
            WHERE b.product_id = p.product_id AND sl.quantity > 0
        )
    `).get().count;
    const criticalAlerts = expiredCount + outOfStockCount;

    // At-Risk Stock: batches expiring within 90 days (but not yet expired)
    const atRiskRow = db.prepare(`
        SELECT 
            COALESCE(SUM(sl.quantity * p.unit_cost), 0) as value,
            COUNT(DISTINCT b.batch_no) as count
        FROM stock_level sl
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE b.expiry_date > date('now')
          AND b.expiry_date <= date('now', '+90 days')
          AND sl.quantity > 0
    `).get();

    res.json({
        pharmacies: { active: activePharmacies, monthlyTransfers },
        warehouse: { totalVolume: warehouseStock, totalValue: warehouseTotalValue, capacityPercent: warehouseCapacityPercent, maxCapacity: warehouseMaxCapacity },
        importers: { activeSuppliers: activeImporters, pendingOrders, topImporter, costSavings, totalMedicinesCovered, medicinesWithNoImporter },
        medicines: { totalSKUs, lowStockAlerts, expiringBatches, criticalAlerts, atRiskValue: atRiskRow.value, atRiskCount: atRiskRow.count }
    });
});

// GET /api/analytics/pharmacies - List of pharmacies with stats
router.get('/pharmacies', (req, res) => {
    const pharmacies = db.prepare(`
        SELECT 
            l.location_id, 
            l.name, 
            l.address, 
            l.is_active,
            (
                SELECT COUNT(*) 
                FROM stock_movement sm
                WHERE sm.to_location = l.location_id 
                  AND sm.movement = 'TRANSFER' 
                  AND sm.created_at >= date('now', '-30 days')
            ) as monthly_transfers,
            (
                SELECT MAX(created_at) 
                FROM stock_movement sm
                WHERE sm.to_location = l.location_id OR sm.from_location = l.location_id
            ) as last_active
        FROM location l
        WHERE l.type = 'Pharmacy'
    `).all();

    res.json(pharmacies);
});

// GET /api/analytics/pharmacies/:id - Pharmacy profile, inventory, logs
router.get('/pharmacies/:id', (req, res) => {
    const locationId = req.params.id;

    const pharmacy = db.prepare("SELECT * FROM location WHERE location_id = ? AND type = 'Pharmacy'").get(locationId);
    if (!pharmacy) {
        return res.status(404).json({ error: 'Pharmacy not found' });
    }

    // Try to get latest supervisor
    const supervisorRow = db.prepare("SELECT author FROM supervisor_note WHERE location_id = ? ORDER BY created_at DESC LIMIT 1").get(locationId);
    pharmacy.supervisor = supervisorRow ? supervisorRow.author : 'Unassigned';

    const inventory = db.prepare(`
        SELECT 
            p.sku, 
            p.name as product_name, 
            b.batch_no, 
            sl.quantity, 
            sl.reorder_point,
            CASE WHEN sl.quantity <= sl.reorder_point THEN 'LOW' ELSE 'OK' END as status
        FROM stock_level sl
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE sl.location_id = ?
    `).all(locationId);

    const transfers = db.prepare(`
        SELECT 
            movement_id,
            movement,
            batch_no,
            quantity,
            from_location,
            to_location,
            created_at,
            reference_note
        FROM stock_movement
        WHERE from_location = ? OR to_location = ?
        ORDER BY created_at DESC
        LIMIT 100
    `).all(locationId, locationId);

    const notes = db.prepare("SELECT * FROM supervisor_note WHERE location_id = ? ORDER BY created_at DESC").all(locationId);
    const orders = db.prepare("SELECT * FROM order_request WHERE pharmacy_id = ? ORDER BY created_at DESC").all(locationId);
    const discrepancies = db.prepare("SELECT * FROM inventory_discrepancy WHERE location_id = ? ORDER BY created_at DESC").all(locationId);

    res.json({
        profile: pharmacy,
        inventory,
        transfers,
        activities: {
            notes,
            orders,
            discrepancies
        }
    });
});

// GET /api/analytics/warehouse - Drill-down data for warehouse
router.get('/warehouse', (req, res) => {
    // 1. Inventory
    const inventory = db.prepare(`
        SELECT 
            p.product_id,
            sl.location_id,
            p.name as product_name, 
            b.batch_no, 
            b.expiry_date, 
            sl.quantity, 
            sl.reorder_point,
            p.storage_condition,
            COALESCE(NULLIF(p.unit_cost, 0), (SELECT MIN(price) FROM supplier_offer WHERE product_id = p.product_id), 0) as unit_cost,
            COALESCE(
              (SELECT loc.name 
               FROM stock_movement sm 
               JOIN location loc ON sm.from_location = loc.location_id
               WHERE sm.batch_no = b.batch_no AND loc.type = 'Supplier'
               ORDER BY sm.created_at ASC LIMIT 1),
              (SELECT loc.name 
               FROM supplier_offer so 
               JOIN location loc ON so.supplier_id = loc.location_id
               WHERE so.product_id = p.product_id
               ORDER BY so.price ASC LIMIT 1),
              'لا يوجد مورد'
            ) as cheapest_importer
        FROM stock_level sl
        JOIN location l ON sl.location_id = l.location_id
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE l.type = 'Warehouse'
    `).all();

    // 2. Activity Logs
    const inbound = db.prepare(`
        SELECT 'INBOUND' as type, sm.created_at, p.name as product_name, sm.quantity, l_from.name as source_name
        FROM stock_movement sm
        JOIN location l_to ON sm.to_location = l_to.location_id
        LEFT JOIN location l_from ON sm.from_location = l_from.location_id
        JOIN batch b ON sm.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE l_to.type = 'Warehouse' AND (sm.movement = 'IN' OR (sm.movement = 'TRANSFER' AND l_from.type = 'Supplier'))
        ORDER BY sm.created_at DESC LIMIT 20
    `).all();

    const outbound = db.prepare(`
        SELECT 'OUTBOUND' as type, sm.created_at, p.name as product_name, sm.quantity, l_to.name as target_name
        FROM stock_movement sm
        JOIN location l_from ON sm.from_location = l_from.location_id
        LEFT JOIN location l_to ON sm.to_location = l_to.location_id
        JOIN batch b ON sm.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE l_from.type = 'Warehouse' AND (sm.movement = 'OUT' OR sm.movement = 'TRANSFER')
        ORDER BY sm.created_at DESC LIMIT 20
    `).all();

    const discrepancies = db.prepare(`
        SELECT 'DISCREPANCY' as type, d.created_at, b.product_id, d.batch_no, d.expected_quantity, d.actual_quantity, d.reason
        FROM inventory_discrepancy d
        JOIN location l ON d.location_id = l.location_id
        LEFT JOIN batch b ON d.batch_no = b.batch_no
        WHERE l.type = 'Warehouse'
        ORDER BY d.created_at DESC LIMIT 20
    `).all();

    // Combine and sort activity logs
    let activityLog = [...inbound, ...outbound, ...discrepancies];
    activityLog.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    activityLog = activityLog.slice(0, 50); // Limit to top 50 recent

    // 3. Alerts
    const expiringSoon = db.prepare(`
        SELECT p.name as product_name, b.batch_no, b.expiry_date, sl.quantity
        FROM stock_level sl
        JOIN location l ON sl.location_id = l.location_id
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE l.type = 'Warehouse' 
          AND b.expiry_date <= date('now', '+30 days')
          AND sl.quantity > 0
        ORDER BY b.expiry_date ASC
    `).all();

    const lowStock = db.prepare(`
        SELECT p.name as product_name, b.batch_no, sl.quantity, sl.reorder_point
        FROM stock_level sl
        JOIN location l ON sl.location_id = l.location_id
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE l.type = 'Warehouse' AND sl.quantity <= sl.reorder_point
    `).all();

    res.json({
        inventory,
        activityLog,
        alerts: {
            expiringSoon,
            lowStock
        }
    });
});

// GET /api/analytics/importers - Drill-down data for Importers
router.get('/importers', (req, res) => {
    // 1. Leaderboard & Profiles
    const importersRows = db.prepare(`
        SELECT l.location_id, l.name, l.address,
               (
                 SELECT COUNT(*) 
                 FROM supplier_offer so 
                 WHERE so.supplier_id = l.location_id
               ) as total_products,
               (
                 SELECT COUNT(*) 
                 FROM supplier_offer so 
                 WHERE so.supplier_id = l.location_id
                   AND (SELECT COUNT(*) FROM supplier_offer WHERE product_id = so.product_id) > 1
               ) as mutual_products_count,
               (
                 SELECT COUNT(*)
                 FROM supplier_offer so1
                 WHERE so1.supplier_id = l.location_id
                   AND (SELECT COUNT(*) FROM supplier_offer WHERE product_id = so1.product_id) > 1
                   AND so1.price = (
                       SELECT MIN(so2.price)
                       FROM supplier_offer so2
                       JOIN location l2 ON so2.supplier_id = l2.location_id AND l2.is_active = 1
                       WHERE so2.product_id = so1.product_id
                   )
               ) as cheap_mutual_products_count,
               (
                 SELECT COUNT(*)
                 FROM supplier_offer so_exc
                 WHERE so_exc.supplier_id = l.location_id
                   AND NOT EXISTS (
                       SELECT 1 FROM supplier_offer so_other
                       JOIN location l_other ON so_other.supplier_id = l_other.location_id AND l_other.is_active = 1
                       WHERE so_other.product_id = so_exc.product_id 
                         AND so_other.supplier_id != l.location_id
                   )
               ) as exclusive_medicines,
               (
                 SELECT GROUP_CONCAT(p.name)
                 FROM supplier_offer so_n
                 JOIN product p ON so_n.product_id = p.product_id
                 WHERE so_n.supplier_id = l.location_id
               ) as medicine_names,
               (
                 SELECT COALESCE(SUM(sm.quantity), 0)
                 FROM stock_movement sm
                 WHERE sm.from_location = l.location_id AND sm.movement = 'TRANSFER'
               ) as total_volume,
               (
                 SELECT COALESCE(SUM(sm.quantity * p.unit_cost), 0)
                 FROM stock_movement sm
                 JOIN batch b ON sm.batch_no = b.batch_no
                 JOIN product p ON b.product_id = p.product_id
                 WHERE sm.from_location = l.location_id AND sm.movement = 'TRANSFER'
               ) as total_spent
        FROM location l
        WHERE l.type = 'Supplier' AND l.is_active = 1
        GROUP BY l.location_id
    `).all();

    // Calculate max values for normalization
    const maxVolume = Math.max(...importersRows.map(i => i.total_volume), 1);
    const maxProducts = Math.max(...importersRows.map(i => i.total_products), 1);

    // Calculate rating (0-100) based on weighted score
    const importers = importersRows.map(i => {
        const priceScore = (i.mutual_products_count > 0) ? Math.round((i.cheap_mutual_products_count / i.mutual_products_count) * 100) : 0; 
        const volumeScore = Math.round((i.total_volume / maxVolume) * 100);
        const diversityScore = Math.round((i.total_products / maxProducts) * 100);
        
        const totalScore = Math.round((priceScore * 0.4) + (volumeScore * 0.4) + (diversityScore * 0.2));
        
        // Map 0-100 to 1-5 stars
        let stars = 1;
        if (totalScore >= 80) stars = 5;
        else if (totalScore >= 60) stars = 4;
        else if (totalScore >= 40) stars = 3;
        else if (totalScore >= 20) stars = 2;

        return { 
            ...i, 
            rank_score: totalScore,
            stars: stars,
            price_score: priceScore, 
            volume_score: volumeScore,
            diversity_score: diversityScore,
            total_orders: i.total_volume || 0,
            total_spent: i.total_spent || 0 
        };
    });
    
    // Sort for leaderboard: Primary rank by price score, secondary by total volume
    // Exclude suppliers with 0 volume and 0 price score from being artificially high
    importers.sort((a, b) => {
        if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
        return b.total_orders - a.total_orders;
    });
    const top5 = importers.slice(0, 5);

    // 2. Comparison Data for Mutual Medicines
    const mutualProducts = db.prepare(`
        SELECT p.product_id, p.name 
        FROM supplier_offer so
        JOIN product p ON so.product_id = p.product_id
        GROUP BY p.product_id
        HAVING COUNT(so.supplier_id) > 1
    `).all();

    const comparisonData = {};
    for (const p of mutualProducts) {
        const suppliersInfo = db.prepare(`
            SELECT 
                l.name as supplier_name,
                so.price,
                so.condition,
                (
                  SELECT COALESCE(SUM(sm.quantity), 0)
                  FROM stock_movement sm
                  JOIN batch b ON sm.batch_no = b.batch_no
                  WHERE sm.from_location = l.location_id 
                    AND sm.movement = 'TRANSFER'
                    AND b.product_id = so.product_id
                ) as historical_volume
            FROM supplier_offer so
            JOIN location l ON so.supplier_id = l.location_id AND l.is_active = 1
            WHERE so.product_id = ?
            ORDER BY so.price ASC
        `).all(p.product_id);
        
        comparisonData[p.name] = suppliersInfo;
    }

    res.json({
        leaderboard: top5,
        all_profiles: importers,
        comparisonData
    });
});

// GET /api/analytics/importers/:id - Detailed Profile for a specific Importer
router.get('/importers/:id', (req, res) => {
    const locationId = req.params.id;
    
    // 1. Basic Info
    const importer = db.prepare(`SELECT * FROM location WHERE location_id = ? AND type = 'Supplier'`).get(locationId);
    if (!importer) return res.status(404).json({ error: 'Importer not found' });

    // 2. Active Offers
    const offers = db.prepare(`
        SELECT so.*, p.name as product_name, p.sku 
        FROM supplier_offer so
        JOIN product p ON so.product_id = p.product_id
        WHERE so.supplier_id = ?
    `).all(locationId);

    // 3. Receipt History (from stock_movement)
    const orders = db.prepare(`
        SELECT sm.movement_id as request_id, 
               sm.created_at,
               sm.quantity,
               p.name as product_name,
               l.name as destination_name,
               (sm.quantity * p.unit_cost) as total_cost
        FROM stock_movement sm
        JOIN batch b ON sm.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        JOIN location l ON sm.to_location = l.location_id
        WHERE sm.from_location = ? AND sm.movement = 'TRANSFER'
        ORDER BY sm.created_at DESC
    `).all(locationId);

    res.json({
        profile: importer,
        offers,
        orders
    });
});

// GET /api/analytics/medicines - Drill-down data for Medicines
router.get('/medicines', (req, res) => {
    // ── Section A: Expiry & Waste Analytics ──
    const allBatchStock = db.prepare(`
        SELECT 
            b.batch_no, b.expiry_date, b.product_id,
            p.name as product_name, p.sku, p.unit_cost,
            sl.quantity, sl.location_id,
            l.name as location_name, l.type as location_type,
            CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
        FROM stock_level sl
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        JOIN location l ON sl.location_id = l.location_id
        WHERE sl.quantity > 0
        ORDER BY b.expiry_date ASC
    `).all();

    const expiryBreakdown = { expired: [], under30: [], under90: [], safe: [] };
    let expiredCount = 0, under30Count = 0, under90Count = 0, safeCount = 0;
    let expiredValue = 0, under30Value = 0, under90Value = 0, safeValue = 0;

    for (const row of allBatchStock) {
        const val = row.quantity * (row.unit_cost || 0);
        if (row.days_until_expiry < 0) {
            expiryBreakdown.expired.push(row);
            expiredCount += row.quantity;
            expiredValue += val;
        } else if (row.days_until_expiry <= 30) {
            expiryBreakdown.under30.push(row);
            under30Count += row.quantity;
            under30Value += val;
        } else if (row.days_until_expiry <= 90) {
            expiryBreakdown.under90.push(row);
            under90Count += row.quantity;
            under90Value += val;
        } else {
            expiryBreakdown.safe.push(row);
            safeCount += row.quantity;
            safeValue += val;
        }
    }

    const expiryChartData = {
        expired: { count: expiredCount, value: expiredValue, batches: expiryBreakdown.expired.length },
        under30: { count: under30Count, value: under30Value, batches: expiryBreakdown.under30.length },
        under90: { count: under90Count, value: under90Value, batches: expiryBreakdown.under90.length },
        safe:    { count: safeCount,    value: safeValue,    batches: expiryBreakdown.safe.length }
    };

    // ── Section B: Consumption & Demand Analytics ──
    const fastMovers = db.prepare(`
        SELECT p.product_id, p.name, p.sku, p.category,
               SUM(sm.quantity) as total_moved,
               COUNT(sm.movement_id) as movement_count
        FROM stock_movement sm
        JOIN batch b ON sm.batch_no = b.batch_no
        JOIN product p ON b.product_id = p.product_id
        WHERE sm.movement = 'OUT'
          AND sm.created_at >= date('now', '-90 days')
          AND (sm.reference_note IS NULL OR sm.reference_note NOT LIKE '[REVERSED]%')
        GROUP BY p.product_id
        ORDER BY total_moved DESC
        LIMIT 10
    `).all();

    const deadStock = db.prepare(`
        SELECT p.product_id, p.name, p.sku, p.category,
               COALESCE(total_sl.total_qty, 0) as total_stock,
               last_move.last_movement
        FROM product p
        LEFT JOIN (
            SELECT b.product_id, MAX(sm.created_at) as last_movement
            FROM stock_movement sm
            JOIN batch b ON sm.batch_no = b.batch_no
            WHERE sm.movement = 'OUT'
              AND (sm.reference_note IS NULL OR sm.reference_note NOT LIKE '[REVERSED]%')
            GROUP BY b.product_id
        ) last_move ON last_move.product_id = p.product_id
        LEFT JOIN (
            SELECT b.product_id, SUM(sl.quantity) as total_qty
            FROM stock_level sl
            JOIN batch b ON sl.batch_no = b.batch_no
            GROUP BY b.product_id
        ) total_sl ON total_sl.product_id = p.product_id
        WHERE (last_move.last_movement IS NULL OR last_move.last_movement < date('now', '-90 days'))
          AND COALESCE(total_sl.total_qty, 0) > 0
        ORDER BY last_move.last_movement ASC
    `).all();

    // ── Section C: Shortage Predictor ──
    const shortageRisks = db.prepare(`
        SELECT 
            p.product_id, p.name, p.sku, p.category,
            COALESCE(SUM(sl.quantity), 0) as total_stock,
            COALESCE(MAX(sl.reorder_point), 0) as reorder_point
        FROM product p
        LEFT JOIN batch b ON p.product_id = b.product_id
        LEFT JOIN (
            SELECT sl.batch_no, sl.quantity, sl.reorder_point
            FROM stock_level sl
            JOIN location l ON sl.location_id = l.location_id
            WHERE l.type = 'Warehouse'
        ) sl ON b.batch_no = sl.batch_no
        GROUP BY p.product_id
        HAVING total_stock <= reorder_point
        ORDER BY (CAST(total_stock AS REAL) / MAX(MAX(reorder_point, 1), 1)) ASC
    `).all();

    // Attach cheapest supplier to each shortage risk item
    for (const item of shortageRisks) {
        const supplier = db.prepare(`
            SELECT so.price, l.name as supplier_name, l.location_id as supplier_id
            FROM supplier_offer so
            JOIN location l ON so.supplier_id = l.location_id
            WHERE so.product_id = ? AND l.is_active = 1
            ORDER BY so.price ASC
            LIMIT 1
        `).get(item.product_id);
        item.cheapest_supplier = supplier ? supplier.supplier_name : null;
        item.cheapest_price = supplier ? supplier.price : null;
        item.supplier_id = supplier ? supplier.supplier_id : null;
        item.deficit = item.total_stock - item.reorder_point;
    }

    // ── Section D: All Medicines ──
    const allMedicines = db.prepare(`
        SELECT 
            p.product_id, p.sku, p.name, p.category, p.unit_cost, p.storage_condition,
            COALESCE(stock_agg.total_stock, 0) as total_stock,
            COALESCE(stock_agg.batch_count, 0) as batch_count,
            COALESCE(stock_agg.wh_stock, 0) as warehouse_stock,
            imp_agg.importer_names,
            COALESCE(imp_agg.importer_count, 0) as importer_count,
            cheap_imp.cheapest_importer,
            imp_agg.cheapest_price
        FROM product p
        LEFT JOIN (
            SELECT b.product_id,
                   SUM(sl.quantity) as total_stock,
                   COUNT(DISTINCT b.batch_no) as batch_count,
                   SUM(CASE WHEN l.type = 'Warehouse' THEN sl.quantity ELSE 0 END) as wh_stock
            FROM batch b
            JOIN stock_level sl ON sl.batch_no = b.batch_no
            JOIN location l ON sl.location_id = l.location_id
            GROUP BY b.product_id
        ) stock_agg ON stock_agg.product_id = p.product_id
        LEFT JOIN (
            SELECT so.product_id,
                   GROUP_CONCAT(DISTINCT l.name) as importer_names,
                   COUNT(DISTINCT so.supplier_id) as importer_count,
                   MIN(so.price) as cheapest_price
            FROM supplier_offer so
            JOIN location l ON so.supplier_id = l.location_id AND l.is_active = 1
            GROUP BY so.product_id
        ) imp_agg ON imp_agg.product_id = p.product_id
        LEFT JOIN (
            SELECT product_id, cheapest_importer FROM (
                SELECT so.product_id, l.name as cheapest_importer,
                       ROW_NUMBER() OVER(PARTITION BY so.product_id ORDER BY so.price ASC, so.created_at DESC) as rn
                FROM supplier_offer so
                JOIN location l ON so.supplier_id = l.location_id AND l.is_active = 1
            ) WHERE rn = 1
        ) cheap_imp ON cheap_imp.product_id = p.product_id
        ORDER BY p.name ASC
    `).all();

    res.json({
        expiryBreakdown,
        expiryChartData,
        fastMovers,
        deadStock,
        shortageRisks,
        allMedicines
    });
});

// GET /api/analytics/medicines/:id - Individual medicine profile
router.get('/medicines/:id', (req, res) => {
    const productId = req.params.id;

    const product = db.prepare('SELECT * FROM product WHERE product_id = ?').get(productId);
    if (!product) {
        return res.status(404).json({ error: 'Medicine not found' });
    }

    // Total stock across all locations
    const stockRow = db.prepare(`
        SELECT COALESCE(SUM(sl.quantity), 0) as total
        FROM stock_level sl
        JOIN batch b ON sl.batch_no = b.batch_no
        WHERE b.product_id = ?
    `).get(productId);
    const totalStock = stockRow.total;

    // Warehouse stock
    const whRow = db.prepare(`
        SELECT COALESCE(SUM(sl.quantity), 0) as total
        FROM stock_level sl
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN location l ON sl.location_id = l.location_id
        WHERE b.product_id = ? AND l.type = 'Warehouse'
    `).get(productId);
    const warehouseStock = whRow.total;

    // Distribution by pharmacy
    const pharmacyDistribution = db.prepare(`
        SELECT l.location_id, l.name as pharmacy_name, SUM(sl.quantity) as quantity
        FROM stock_level sl
        JOIN batch b ON sl.batch_no = b.batch_no
        JOIN location l ON sl.location_id = l.location_id
        WHERE b.product_id = ? AND l.type = 'Pharmacy' AND sl.quantity > 0
        GROUP BY l.location_id
        ORDER BY quantity DESC
    `).all(productId);

    // All batches with location info
    const batches = db.prepare(`
        SELECT b.batch_no, b.expiry_date, b.manufactured,
               sl.quantity, sl.location_id,
               l.name as location_name, l.type as location_type,
               CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
        FROM batch b
        JOIN stock_level sl ON sl.batch_no = b.batch_no
        JOIN location l ON sl.location_id = l.location_id
        WHERE b.product_id = ? AND sl.quantity > 0
        ORDER BY b.expiry_date ASC
    `).all(productId);

    // Price history from suppliers (active suppliers only)
    const priceHistory = db.prepare(`
        SELECT h.price, date(h.recorded_at) as date_val, l.name as supplier_name
        FROM supplier_price_history h
        JOIN location l ON h.supplier_id = l.location_id AND l.is_active = 1
        WHERE h.product_id = ?
        ORDER BY h.recorded_at ASC
    `).all(productId);

    // Current supplier offers
    const currentOffers = db.prepare(`
        SELECT so.price, so.condition, l.name as supplier_name, l.location_id as supplier_id
        FROM supplier_offer so
        JOIN location l ON so.supplier_id = l.location_id
        WHERE so.product_id = ? AND l.is_active = 1
        ORDER BY so.price ASC
    `).all(productId);

    // Recent movement history
    const movementHistory = db.prepare(`
        SELECT sm.movement_id, sm.movement, sm.quantity, sm.created_at, sm.reference_note,
               sm.batch_no,
               l_from.name as from_name,
               l_to.name as to_name
        FROM stock_movement sm
        JOIN batch b ON sm.batch_no = b.batch_no
        LEFT JOIN location l_from ON sm.from_location = l_from.location_id
        LEFT JOIN location l_to ON sm.to_location = l_to.location_id
        WHERE b.product_id = ?
        ORDER BY sm.created_at DESC
        LIMIT 50
    `).all(productId);

    res.json({
        product,
        totalStock,
        warehouseStock,
        pharmacyDistribution,
        batches,
        priceHistory,
        currentOffers,
        movementHistory
    });
});

module.exports = router;
