import type { Model, PopulateOptions } from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { buildFilters, buildSearch, paginated, type ListOptions } from '../utils/query.js';
import type { Request } from 'express';

type Filter = Record<string, unknown>;
type Populate = string | PopulateOptions | (string | PopulateOptions)[];

export interface CrudServiceConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  /** Fields matched case-insensitively by `?search=`. */
  searchFields?: string[];
  /** Fields that may be filtered by query string (`?status=active&date_gte=2026-01-01`). */
  filterFields?: string[];
  populate?: Populate;
  defaultSort?: string;
}

export type CrudService = ReturnType<typeof createCrudService>;

export function createCrudService(cfg: CrudServiceConfig) {
  const { model, searchFields = [], filterFields = [] } = cfg;
  const populate = cfg.populate === undefined ? [] : Array.isArray(cfg.populate) ? cfg.populate : [cfg.populate];
  const label = model.modelName;

  return {
    config: cfg,
    model,

    async list(query: Request['query'], opts: ListOptions, scope: Filter = {}) {
      const filter = { ...buildFilters(query, filterFields), ...buildSearch(opts.search, searchFields), ...scope };
      const [items, total] = await Promise.all([
        model
          .find(filter)
          .sort(opts.sort)
          .skip(opts.skip)
          .limit(opts.limit)
          .populate(populate)
          .lean(),
        model.countDocuments(filter),
      ]);
      return paginated(items, total, opts);
    },

    async getById(id: string, scope: Filter = {}) {
      const doc = await model.findOne({ _id: id, ...scope }).populate(populate).lean();
      if (!doc) throw ApiError.notFound(`${label} not found`);
      return doc;
    },

    async create(data: Record<string, unknown>) {
      const doc = await model.create(data);
      return model.findById(doc._id).populate(populate).lean();
    },

    async update(id: string, data: Record<string, unknown>, scope: Filter = {}) {
      const doc = await model
        .findOneAndUpdate({ _id: id, ...scope }, data, { returnDocument: 'after', runValidators: true })
        .populate(populate)
        .lean();
      if (!doc) throw ApiError.notFound(`${label} not found`);
      return doc;
    },

    async remove(id: string, scope: Filter = {}) {
      const doc = await model.findOneAndDelete({ _id: id, ...scope });
      if (!doc) throw ApiError.notFound(`${label} not found`);
      return doc;
    },
  };
}
