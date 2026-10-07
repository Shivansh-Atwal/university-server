import path from 'node:path';
import fs from 'node:fs';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProd } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { UPLOAD_DIR } from './middleware/upload.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import commonRoutes from './routes/common.routes.js';
import facultyRoutes from './routes/faculty.routes.js';
import resourceRoutes from './routes/resources.routes.js';
import studentRoutes from './routes/student.routes.js';
export function createApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    // https://localhost is the origin of the pages inside the Android app.
    app.use(cors({ origin: [...env.CLIENT_URL.split(','), 'https://localhost'], credentials: true }));
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    if (!isProd)
        app.use(morgan('dev'));
    app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });
    app.use('/api/auth', authRoutes);
    // Everything below requires a valid access token.
    app.use('/api', authenticate);
    app.use('/api/admin', adminRoutes);
    app.use('/api/student', studentRoutes);
    app.use('/api/faculty', facultyRoutes);
    app.use('/api', commonRoutes);
    app.use('/api', resourceRoutes);
    app.use('/api', notFound);
    // In production the API also serves the built client (SPA fallback).
    const clientDist = path.resolve(process.cwd(), '../client/dist');
    if (isProd && fs.existsSync(clientDist)) {
        app.use(express.static(clientDist, { maxAge: '1h' }));
        app.get(/^\/(?!api|uploads).*/, (_req, res) => {
            res.sendFile(path.join(clientDist, 'index.html'));
        });
    }
    app.use(notFound);
    app.use(errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map