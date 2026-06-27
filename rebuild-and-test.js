const { execSync } = require('child_process');

// SAFEGUARD: Always use the test database when rebuilding
process.env.TEST_DB_PATH = 'data/vet-monitor-test.db';

console.log('--- STARTING REBUILD AND TEST ---');

// 1. Rollback all migrations
console.log('Rolling back all migrations...');
let rollbackCount = 0;
while (true) {
  try {
    const output = execSync('node db/migrate.js down', { encoding: 'utf8' });
    console.log(output.trim());
    if (output.includes('Nothing to rollback')) {
      break;
    }
    rollbackCount++;
    if (rollbackCount > 20) {
      console.error('Too many rollbacks, breaking loop');
      break;
    }
  } catch (error) {
    console.error('Error during rollback:', error.message);
    process.exit(1);
  }
}

// 2. Apply all migrations
console.log('Applying all migrations...');
try {
  const output = execSync('node db/migrate.js', { encoding: 'utf8' });
  console.log(output.trim());
} catch (error) {
  console.error('Error during migrate up:', error.message);
  process.exit(1);
}

// 3. Seed database
console.log('Seeding database...');
try {
  const output = execSync('node db/seed.js', { encoding: 'utf8' });
  console.log(output.trim());
} catch (error) {
  console.error('Error during seeding:', error.message);
  process.exit(1);
}

// 4. Run tests
console.log('Running tests...');
try {
  const test1 = execSync('node --test tests/e2e.test.js', { encoding: 'utf8' });
  console.log(test1);
} catch (error) {
  console.error('e2e.test.js failed:', error.stdout || error.message);
  process.exit(1);
}

try {
  const test2 = execSync('node tests/verify-switcher.js', { encoding: 'utf8' });
  console.log(test2);
} catch (error) {
  console.error('verify-switcher.js failed:', error.stdout || error.message);
  process.exit(1);
}

console.log('--- REBUILD AND TEST COMPLETED SUCCESSFULLY ---');
