import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
export function notFound(req, _res, next) {
    next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
/** Centralized error handler: normalizes every error into { message, errors? }. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err, _req, res, _next) {
    let status = 500;
    let message = 'Something went wrong';
    let errors;
    if (err instanceof ApiError) {
        status = err.statusCode;
        message = err.message;
        if (err.details && typeof err.details === 'object')
            errors = err.details;
    }
    else if (err instanceof ZodError) {
        status = 422;
        message = 'Validation failed';
        errors = {};
        for (const issue of err.issues)
            errors[issue.path.join('.') || '_'] = issue.message;
    }
    else if (err instanceof mongoose.Error.ValidationError) {
        status = 422;
        message = 'Validation failed';
        errors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    }
    else if (err instanceof mongoose.Error.CastError) {
        status = 400;
        message = `Invalid value for ${err.path}`;
    }
    else if (err instanceof multer.MulterError) {
        status = 400;
        message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    }
    else if (isDuplicateKey(err)) {
        status = 409;
        const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
        message = `A record with this ${field} already exists`;
        errors = { [field]: 'Already exists' };
    }
    if (status >= 500)
        console.error(err);
    res.status(status).json({
        message,
        ...(errors && { errors }),
        ...(!isProd && status >= 500 && err instanceof Error && { stack: err.stack }),
    });
}
function isDuplicateKey(err) {
    return typeof err === 'object' && err !== null && err.code === 11000;
}
//# sourceMappingURL=error.js.map