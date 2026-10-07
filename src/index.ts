import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env, isProd } from './config/env.js';
import { User } from './models/User.js';
import { seedDatabase } from './seed/data.js';

import dns from 'node:dns';

dns.setServers([
  '8.8.8.8',
  '8.8.4.4',
]);

/** Without an admin nobody can create accounts, so a database with none gets one on startup. */
async function ensureAdmin() {
  if (await User.exists({ role: 'admin' })) return;
  const password = env.ADMIN_PASSWORD ?? (isProd ? undefined : 'Admin@123');
  if (!password) {
    console.warn('[auth] no admin account exists; set ADMIN_EMAIL and ADMIN_PASSWORD to create one');
    return;
  }
  await User.create({ name: 'Administrator', email: env.ADMIN_EMAIL, password, role: 'admin' });
  console.log(`[auth] created first admin account ${env.ADMIN_EMAIL}${env.ADMIN_PASSWORD ? '' : ' with the default password Admin@123'}; change the password after signing in`);
}

async function main() {
  const { embedded } = await connectDB();

  // First run on the embedded database: load demo data so the app is usable immediately.
  if (embedded && (await User.estimatedDocumentCount()) === 0) {
    console.log('[seed] empty embedded database, loading demo data...');
    await seedDatabase();
  }

  await ensureAdmin();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
