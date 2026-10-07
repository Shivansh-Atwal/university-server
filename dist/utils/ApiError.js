export class ApiError extends Error {
    statusCode;
    details;
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
    static badRequest(msg = 'Bad request', details) {
        return new ApiError(400, msg, details);
    }
    static unauthorized(msg = 'Authentication required') {
        return new ApiError(401, msg);
    }
    static forbidden(msg = 'You do not have permission to perform this action') {
        return new ApiError(403, msg);
    }
    static notFound(msg = 'Resource not found') {
        return new ApiError(404, msg);
    }
    static conflict(msg = 'Resource already exists') {
        return new ApiError(409, msg);
    }
}
//# sourceMappingURL=ApiError.js.map