import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env, isProd } from './env.js';

let memoryServer: {
  stop: () => Promise<boolean>;
} | null = null;

let isConnected = false;

/**
 * Connect to MongoDB.
 *
 * Production:
 *   Uses MONGODB_URI from environment variables.
 *
 * Development:
 *   If MONGODB_URI is not provided, starts an embedded MongoDB
 *   using mongodb-memory-server and stores its data in .data.
 */
export async function connectDB(): Promise<{ embedded: boolean }> {
  mongoose.set('strictQuery', true);

  // Already connected
  if (isConnected && mongoose.connection.readyState === 1) {
    return {
      embedded: memoryServer !== null,
    };
  }

  let uri = env.MONGODB_URI;
  let embedded = false;

  /**
   * Use embedded MongoDB in development when
   * MONGODB_URI is not configured.
   */
  if (!uri) {
    if (isProd) {
      throw new Error(
        'MONGODB_URI is required when running in production.'
      );
    }

    console.log('[db] MONGODB_URI not found.');
    console.log('[db] Starting embedded MongoDB...');

    const { MongoMemoryServer } = await import(
      'mongodb-memory-server'
    );

    const dbPath = path.resolve(process.cwd(), '.data');

    fs.mkdirSync(dbPath, {
      recursive: true,
    });

    const server = await MongoMemoryServer.create({
      instance: {
        dbPath,
        storageEngine: 'wiredTiger',
        port: 27027,
      },
    });

    memoryServer = server;
    uri = server.getUri('university');
    embedded = true;

    console.log(`[db] embedded MongoDB started at ${uri}`);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });

    isConnected = true;

    console.log(
      `[db] MongoDB connected${embedded ? ' (embedded)' : ''}`
    );

    return {
      embedded,
    };
  } catch (error) {
    isConnected = false;

    // Stop embedded MongoDB if connection fails
    if (memoryServer) {
      try {
        await memoryServer.stop();
      } catch {
        // Ignore shutdown errors
      }

      memoryServer = null;
    }

    console.error('[db] MongoDB connection failed:', error);

    throw error;
  }
}

/**
 * Disconnect MongoDB and stop embedded MongoDB if running.
 */
export async function disconnectDB(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } finally {
    isConnected = false;

    if (memoryServer) {
      try {
        await memoryServer.stop();
        console.log('[db] embedded MongoDB stopped');
      } catch (error) {
        console.error(
          '[db] failed to stop embedded MongoDB:',
          error
        );
      } finally {
        memoryServer = null;
      }
    }

    console.log('[db] MongoDB disconnected');
  }
}

/**
 * Handle application shutdown gracefully.
 */
export function registerDBShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    console.log(`[db] received ${signal}, shutting down...`);

    try {
      await disconnectDB();
      process.exit(0);
    } catch (error) {
      console.error('[db] shutdown error:', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}