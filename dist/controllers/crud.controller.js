import { parseListOptions } from '../utils/query.js';
export function createCrudController(service, hooks = {}) {
    const scopeOf = async (req) => (hooks.scope ? await hooks.scope(req) : {});
    return {
        list: async (req, res) => {
            const opts = parseListOptions(req, service.config.defaultSort);
            res.json(await service.list(req.query, opts, await scopeOf(req)));
        },
        get: async (req, res) => {
            res.json(await service.getById(String(req.params.id), await scopeOf(req)));
        },
        create: async (req, res) => {
            const data = hooks.beforeCreate ? await hooks.beforeCreate(req, req.body) : req.body;
            const doc = await service.create(data);
            if (hooks.afterCreate)
                await hooks.afterCreate(req, doc);
            res.status(201).json(doc);
        },
        update: async (req, res) => {
            const doc = await service.update(String(req.params.id), req.body, await scopeOf(req));
            if (hooks.afterUpdate)
                await hooks.afterUpdate(req, doc);
            res.json(doc);
        },
        remove: async (req, res) => {
            await service.remove(String(req.params.id), await scopeOf(req));
            res.status(204).end();
        },
    };
}
//# sourceMappingURL=crud.controller.js.map