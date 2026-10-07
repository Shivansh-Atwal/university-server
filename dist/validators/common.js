import { z } from 'zod';
/** Treats '' and null (common from HTML forms) as "not provided". */
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const optId = z.preprocess(blankToUndefined, objectId.optional());
export const optStr = z.preprocess(blankToUndefined, z.string().trim().optional());
export const reqStr = (label = 'This field') => z.string().trim().min(1, `${label} is required`);
export const optNum = z.preprocess(blankToUndefined, z.coerce.number().optional());
export const reqNum = z.coerce.number();
export const reqDate = z.coerce.date();
export const optDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
export const optBool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : blankToUndefined(v)), z.boolean().optional());
export const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format');
export const optTime = z.preprocess(blankToUndefined, time.optional());
export const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email'));
export const idList = z.preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v ?? []), z.array(objectId));
export const optEnum = (values) => z.preprocess(blankToUndefined, z.enum(values).optional());
export const fileSchema = z.object({
    name: z.string(),
    url: z.string(),
    size: z.number().optional(),
    mimeType: z.string().optional(),
});
export const idParam = z.object({ id: objectId });
//# sourceMappingURL=common.js.map