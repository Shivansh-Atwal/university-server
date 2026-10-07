import { connectDB, disconnectDB } from '../config/db.js';
import { seedDatabase } from './data.js';

/** `npm run seed` — wipes the database and loads demo data. */
async function run() {
  await connectDB();
  await seedDatabase();
  await disconnectDB();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
