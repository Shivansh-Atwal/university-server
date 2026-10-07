import mongoose from 'mongoose';
const RESERVED = new Set(['page', 'limit', 'sort', 'search', 'q', 'fields']);
/** Parses ?page=&limit=&sort=-createdAt,name&search= into mongoose-friendly options. */
export function parseListOptions(req, defaultSort = '-createdAt') {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const sortStr = String(req.query.sort || defaultSort);
    const sort = {};
    for (const part of sortStr.split(',').filter(Boolean)) {
        const key = part.replace(/^-/, '').replace(/[^\w.]/g, '');
        if (key)
            sort[key] = part.startsWith('-') ? -1 : 1;
    }
    const search = String(req.query.search ?? req.query.q ?? '').trim() || undefined;
    return { page, limit, skip: (page - 1) * limit, sort, search };
}
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function buildSearch(search, fields) {
    if (!search || !fields.length)
        return {};
    const rx = new RegExp(escapeRegex(search), 'i');
    return { $or: fields.map((f) => ({ [f]: rx })) };
}
/**
 * Turns whitelisted query params into filters. Supports comma lists (`$in`)
 * and `field_gte` / `field_lte` range suffixes for dates and numbers.
 */
export function buildFilters(query, allowed) {
    const filter = {};
    for (const [rawKey, rawVal] of Object.entries(query)) {
        if (RESERVED.has(rawKey) || rawVal === undefined || rawVal === '')
            continue;
        const m = rawKey.match(/^(.+?)_(gte|lte|gt|lt)$/);
        const key = m ? m[1] : rawKey;
        if (!allowed.includes(key))
            continue;
        const val = String(rawVal);
        if (m) {
            const cast = /^\d{4}-\d{2}-\d{2}/.test(val) ? new Date(val) : Number(val);
            filter[key] = { ...filter[key], [`$${m[2]}`]: cast };
        }
        else if (val.includes(',')) {
            filter[key] = { $in: val.split(',').map(castValue) };
        }
        else {
            filter[key] = castValue(val);
        }
    }
    return filter;
}
function castValue(v) {
    if (v === 'true')
        return true;
    if (v === 'false')
        return false;
    if (/^[a-f\d]{24}$/i.test(v))
        return new mongoose.Types.ObjectId(v);
    if (/^-?\d+(\.\d+)?$/.test(v))
        return Number(v);
    return v;
}
export function paginated(items, total, opts) {
    return {
        items,
        meta: {
            total,
            page: opts.page,
            limit: opts.limit,
            totalPages: Math.max(1, Math.ceil(total / opts.limit)),
        },
    };
}
//# sourceMappingURL=query.js.map