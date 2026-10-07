import { Router } from 'express';
import { createCrudController } from '../controllers/crud.controller.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createCrudService } from '../services/crud.service.js';
import { idParam } from '../validators/common.js';
/** Builds a standard REST router: GET /, GET /:id, POST /, PATCH /:id, DELETE /:id. */
export function crudRouter(cfg) {
    const { schema, read = [], write = ['admin'], scope, beforeCreate, afterCreate, afterUpdate } = cfg;
    const service = createCrudService(cfg);
    const ctrl = createCrudController(service, { scope, beforeCreate, afterCreate, afterUpdate });
    const router = Router();
    router.get('/', authorize(...read), ctrl.list);
    router.get('/:id', authorize(...read), validate({ params: idParam }), ctrl.get);
    router.post('/', authorize(...write), validate({ body: schema }), ctrl.create);
    router.patch('/:id', authorize(...write), validate({ params: idParam, body: schema.partial() }), ctrl.update);
    router.delete('/:id', authorize(...write), validate({ params: idParam }), ctrl.remove);
    return router;
}
//# sourceMappingURL=crud.routes.js.map