/**
 * Validates and coerces request parts with Zod. The parsed body replaces `req.body`;
 * parsed query/params are stored on `res.locals` because Express 5 makes `req.query` read-only.
 */
export const validate = (schemas) => (req, res, next) => {
    try {
        if (schemas.params)
            res.locals.params = schemas.params.parse(req.params);
        if (schemas.query)
            res.locals.query = schemas.query.parse(req.query);
        if (schemas.body)
            req.body = schemas.body.parse(req.body ?? {});
        next();
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=validate.js.map