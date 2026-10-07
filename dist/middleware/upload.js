import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { ApiError } from '../utils/ApiError.js';
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
];
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED.includes(file.mimetype))
            cb(null, true);
        else
            cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
    },
});
/**
 * Writes uploaded files to disk. Raster images are resized (max 1600px) and
 * re-encoded as WebP, which typically cuts their size by 60-80%.
 */
export async function persistFiles(files) {
    return Promise.all(files.map(async (file) => {
        const id = crypto.randomBytes(8).toString('hex');
        const isImage = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
        if (isImage) {
            const filename = `${Date.now()}-${id}.webp`;
            const info = await sharp(file.buffer)
                .rotate()
                .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(path.join(UPLOAD_DIR, filename));
            return {
                name: file.originalname.replace(/\.\w+$/, '.webp'),
                url: `/uploads/${filename}`,
                size: info.size,
                mimeType: 'image/webp',
            };
        }
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '');
        const filename = `${Date.now()}-${id}${ext}`;
        await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
        return { name: file.originalname, url: `/uploads/${filename}`, size: file.size, mimeType: file.mimetype };
    }));
}
/** Multer + persist in one middleware; stored files land on `res.locals.files`. */
export const handleUpload = (field = 'files', max = 5) => [
    upload.array(field, max),
    async (req, res, next) => {
        try {
            const files = req.files ?? [];
            res.locals.files = await persistFiles(files);
            next();
        }
        catch (err) {
            next(err);
        }
    },
];
//# sourceMappingURL=upload.js.map