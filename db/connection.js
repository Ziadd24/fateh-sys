/**
 * Reusable SQLite connection.
 * Automatically creates the 'data' directory and 'vet-monitor.db' file.
 * Uses the native 'node:sqlite' module (Node.js 22.5+).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.TEST_DB_PATH
  ? path.resolve(process.env.TEST_DB_PATH)
  : path.join(dataDir, 'vet-monitor.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Helper method to wrap a function in a transaction since node:sqlite does not have db.transaction() like better-sqlite3 yet.
let transactionDepth = 0;
db.transaction = (fn) => {
  return (...args) => {
    transactionDepth++;
    if (transactionDepth === 1) {
      db.exec('BEGIN TRANSACTION');
    } else {
      db.exec(`SAVEPOINT sp_${transactionDepth}`);
    }
    
    try {
      const result = fn(...args);
      if (transactionDepth === 1) {
        db.exec('COMMIT');
      } else {
        db.exec(`RELEASE SAVEPOINT sp_${transactionDepth}`);
      }
      return result;
    } catch (err) {
      if (transactionDepth === 1) {
        db.exec('ROLLBACK');
      } else {
        db.exec(`ROLLBACK TO SAVEPOINT sp_${transactionDepth}`);
      }
      throw err;
    } finally {
      transactionDepth--;
    }
  };
};

module.exports = db;
