import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
    PORT: z.coerce.number().default(5000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGODB_URI: z.string().optional().default(''),
    JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret'),
    JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    // First administrator, created on startup when the database has no admin account.
    ADMIN_EMAIL: z.string().default('admin@university.edu'),
    ADMIN_PASSWORD: z.string().optional(),
});
export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
//# sourceMappingURL=env.js.map