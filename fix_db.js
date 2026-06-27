const db = require('./db/connection.js');
try {
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare("UPDATE batch SET batch_no = REPLACE(batch_no, '-undefined', '-001') WHERE batch_no LIKE '%-undefined'").run();
  db.prepare("UPDATE stock_level SET batch_no = REPLACE(batch_no, '-undefined', '-001') WHERE batch_no LIKE '%-undefined'").run();
  db.prepare("UPDATE stock_movement SET batch_no = REPLACE(batch_no, '-undefined', '-001') WHERE batch_no LIKE '%-undefined'").run();
  db.exec('PRAGMA foreign_keys = ON');
  console.log('Fixed undefined batches safely!');
} catch (err) {
  console.error(err);
}
