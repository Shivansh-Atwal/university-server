import type { Request, Response } from 'express';
import type { CrudService } from '../services/crud.service.js';
import { parseListOptions } from '../utils/query.js';

type Filter = Record<string, unknown>;

export interface CrudHooks {
  /** Extra filter applied to every read/update/delete, e.g. to restrict by audience or owner. */
  scope?: (req: Request) => Filter | Promise<Filter>;
  beforeCreate?: (req: Request, data: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterCreate?: (req: Request, doc: unknown) => void | Promise<void>;
  afterUpdate?: (req: Request, doc: unknown) => void | Promise<void>;
}

export function createCrudController(service: CrudService, hooks: CrudHooks = {}) {
  const scopeOf = async (req: Request) => (hooks.scope ? await hooks.scope(req) : {});

  return {
    list: async (req: Request, res: Response) => {
      const opts = parseListOptions(req, service.config.defaultSort);
      res.json(await service.list(req.query, opts, await scopeOf(req)));
    },

    get: async (req: Request, res: Response) => {
      res.json(await service.getById(String(req.params.id), await scopeOf(req)));
    },

    create: async (req: Request, res: Response) => {
      const data = hooks.beforeCreate ? await hooks.beforeCreate(req, req.body) : req.body;
      const doc = await service.create(data);
      if (hooks.afterCreate) await hooks.afterCreate(req, doc);
      res.status(201).json(doc);
    },

    update: async (req: Request, res: Response) => {
      const doc = await service.update(String(req.params.id), req.body, await scopeOf(req));
      if (hooks.afterUpdate) await hooks.afterUpdate(req, doc);
      res.json(doc);
    },

    remove: async (req: Request, res: Response) => {
      await service.remove(String(req.params.id), await scopeOf(req));
      res.status(204).end();
    },
  };
}
