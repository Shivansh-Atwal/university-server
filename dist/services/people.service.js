import { Faculty, Student } from '../models/people.js';
import { RefreshToken, User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { buildFilters, paginated } from '../utils/query.js';
const USER_FIELDS = ['name', 'email', 'password', 'phone', 'isActive', 'avatar'];
function splitUserFields(data) {
    const user = {};
    const profile = {};
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined)
            continue;
        if (USER_FIELDS.includes(k))
            user[k] = v;
        else
            profile[k] = v;
    }
    // Flat guardian fields from forms map to the nested guardian object.
    for (const key of ['Name', 'Relation', 'Phone']) {
        const flat = `guardian${key}`;
        if (flat in profile) {
            profile[`guardian.${key.toLowerCase()}`] = profile[flat];
            delete profile[flat];
        }
    }
    return { user, profile };
}
function createPeopleService(cfg) {
    const { model, role, idField } = cfg;
    const populate = [{ path: 'user', select: 'name email phone avatar isActive lastLoginAt' }, ...cfg.populate];
    return {
        async list(query, opts) {
            const filter = buildFilters(query, cfg.filterFields);
            if (opts.search) {
                const rx = new RegExp(opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                const users = await User.find({ role, $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
                filter.$or = [{ [idField]: rx }, { user: { $in: users.map((u) => u._id) } }];
                if (role === 'student')
                    filter.$or.push({ rollNo: rx });
            }
            // Sorting by name lives on the User document, so it is handled with an aggregation-free lookup.
            const sortByName = 'user.name' in opts.sort || 'name' in opts.sort;
            if (sortByName) {
                const dir = (opts.sort['user.name'] ?? opts.sort.name);
                const all = await model.find(filter).select('_id user').populate('user', 'name').lean();
                all.sort((a, b) => dir * String(a.user?.name ?? '').localeCompare(String(b.user?.name ?? '')));
                const ids = all.slice(opts.skip, opts.skip + opts.limit).map((d) => String(d._id));
                const docs = await model.find({ _id: { $in: ids } }).populate(populate).lean();
                docs.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));
                return paginated(docs, all.length, opts);
            }
            const [items, total] = await Promise.all([
                model.find(filter).sort(opts.sort).skip(opts.skip).limit(opts.limit).populate(populate).lean(),
                model.countDocuments(filter),
            ]);
            return paginated(items, total, opts);
        },
        async get(id) {
            const doc = await model.findById(id).populate(populate).lean();
            if (!doc)
                throw ApiError.notFound();
            return doc;
        },
        async create(data) {
            const { user: userData, profile } = splitUserFields(data);
            if (await User.exists({ email: String(userData.email) })) {
                throw ApiError.conflict('Email already in use');
            }
            const user = await User.create({ ...userData, password: String(userData.password ?? cfg.defaultPassword), role });
            try {
                const doc = await model.create({ ...profile, user: user._id });
                return this.get(String(doc._id));
            }
            catch (err) {
                await User.deleteOne({ _id: user._id });
                throw err;
            }
        },
        async update(id, data) {
            const doc = await model.findById(id);
            if (!doc)
                throw ApiError.notFound();
            const { user: userData, profile } = splitUserFields(data);
            if (Object.keys(userData).length) {
                const user = await User.findById(doc.user).select('+password');
                if (!user)
                    throw ApiError.notFound('Linked user not found');
                Object.assign(user, userData);
                await user.save();
                if (userData.password || userData.isActive === false)
                    await RefreshToken.deleteMany({ user: user._id });
            }
            if (Object.keys(profile).length) {
                await model.updateOne({ _id: id }, { $set: profile }, { runValidators: true });
            }
            return this.get(id);
        },
        async remove(id) {
            const doc = await model.findByIdAndDelete(id);
            if (!doc)
                throw ApiError.notFound();
            await Promise.all([User.deleteOne({ _id: doc.user }), RefreshToken.deleteMany({ user: doc.user })]);
        },
    };
}
export const studentService = createPeopleService({
    model: Student,
    role: 'student',
    idField: 'enrollmentNo',
    defaultPassword: 'Student@123',
    populate: [
        { path: 'program', select: 'name code' },
        { path: 'department', select: 'name code' },
        { path: 'section', select: 'name semesterNumber' },
        { path: 'transportRoute', select: 'routeNo name' },
    ],
    filterFields: ['department', 'program', 'section', 'currentSemester', 'status', 'batch', 'gender'],
});
export const facultyService = createPeopleService({
    model: Faculty,
    role: 'faculty',
    idField: 'employeeId',
    defaultPassword: 'Faculty@123',
    populate: [{ path: 'department', select: 'name code' }],
    filterFields: ['department', 'designation', 'status'],
});
export { splitUserFields };
//# sourceMappingURL=people.service.js.map