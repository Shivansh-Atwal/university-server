import { ApiError } from '../utils/ApiError.js';
import { buildFilters, buildSearch, paginated } from '../utils/query.js';
export function createCrudService(cfg) {
    const { model, searchFields = [], filterFields = [] } = cfg;
    const populate = cfg.populate === undefined ? [] : Array.isArray(cfg.populate) ? cfg.populate : [cfg.populate];
    const label = model.modelName;
    return {
        config: cfg,
        model,
        async list(query, opts, scope = {}) {
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
        async getById(id, scope = {}) {
            const doc = await model.findOne({ _id: id, ...scope }).populate(populate).lean();
            if (!doc)
                throw ApiError.notFound(`${label} not found`);
            return doc;
        },
        async create(data) {
            const doc = await model.create(data);
            return model.findById(doc._id).populate(populate).lean();
        },
        async update(id, data, scope = {}) {
            const doc = await model
                .findOneAndUpdate({ _id: id, ...scope }, data, { returnDocument: 'after', runValidators: true })
                .populate(populate)
                .lean();
            if (!doc)
                throw ApiError.notFound(`${label} not found`);
            return doc;
        },
        async remove(id, scope = {}) {
            const doc = await model.findOneAndDelete({ _id: id, ...scope });
            if (!doc)
                throw ApiError.notFound(`${label} not found`);
            return doc;
        },
    };
}
//# sourceMappingURL=crud.service.js.map