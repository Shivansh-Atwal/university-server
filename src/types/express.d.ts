import type { Role } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        /** Student or Faculty document id for those roles. */
        profileId?: string;
      };
    }
  }
}

export {};
