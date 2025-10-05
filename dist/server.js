"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promise_1 = __importDefault(require("mysql2/promise"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_session_1 = __importDefault(require("express-session"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
const PORT = 3000;
// ------------------- Middleware -------------------
app.use((0, cors_1.default)({ origin: 'http://localhost:4200', credentials: true }));
app.use(body_parser_1.default.json());
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, 'uploads')));
app.use((0, express_session_1.default)({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // 1 ชั่วโมง
}));
// ------------------- Multer -------------------
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const dir = path_1.default.join(__dirname, 'uploads');
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = (0, multer_1.default)({ storage });
// ------------------- MySQL Pool -------------------
const db = promise_1.default.createPool({
    host: '202.28.34.203',
    user: 'mb68_66011212155',
    password: 'uKayQT6Ly2i(',
    database: 'mb68_66011212155',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
// ------------------- Auth Middleware -------------------
function authMiddleware(req, res, next) {
    if (!req.session.userId)
        return res.status(401).json({ message: 'Unauthorized' });
    next();
}
// ------------------- Admin Middleware -------------------
function adminMiddleware(req, res, next) {
    if (req.session.role !== 'admin')
        return res.status(403).json({ message: 'Forbidden' });
    next();
}
// ------------------- Create default admin -------------------
async function createDefaultAdmin() {
    try {
        const [rows] = await db.query('SELECT * FROM user_gameshop_web WHERE role = ?', ['admin']);
        if (rows.length === 0) {
            const name = 'Admin';
            const email = 'admin@example.com';
            const password = 'admin123';
            const hashedPassword = await bcryptjs_1.default.hash(password, 10);
            await db.query('INSERT INTO user_gameshop_web (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, 'admin']);
            console.log('Default admin created: admin@example.com / admin123');
        }
        else {
            console.log('Admin already exists');
        }
    }
    catch (err) {
        console.error('Error creating default admin:', err);
    }
}
// ------------------- Routes -------------------
// Test
app.get('/', (req, res) => res.send('Hello World! YoYo'));
// Register
app.post('/register', upload.single('profile_image'), async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ message: 'Missing fields' });
        const [existing] = await db.query('SELECT * FROM user_gameshop_web WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.status(400).json({ message: 'Email already exists' });
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const profile_image = req.file ? `/uploads/${req.file.filename}` : null;
        await db.query('INSERT INTO user_gameshop_web (name, email, password, role, profile_image) VALUES (?, ?, ?, ?, ?)', [name, email, hashedPassword, 'user', profile_image]);
        res.json({ message: 'User registered successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
// Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Missing fields' });
    try {
        const [rows] = await db.query('SELECT * FROM user_gameshop_web WHERE email = ?', [email]);
        const user = rows[0];
        if (!user)
            return res.status(400).json({ message: 'User not found' });
        const match = await bcryptjs_1.default.compare(password, user.password);
        if (!match)
            return res.status(400).json({ message: 'Incorrect password' });
        req.session.userId = user.id;
        req.session.role = user.role;
        res.json({ message: 'Login successful', role: user.role });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
// Get current user
app.get('/me', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name, email, role, profile_image FROM user_gameshop_web WHERE id = ?', [req.session.userId]);
        const user = rows[0];
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        // wallet demo
        user.walletBalance = 0.98;
        // full URL for Angular
        if (user.profile_image) {
            user.profile_image = `http://localhost:${PORT}${user.profile_image}`;
        }
        else {
            user.profile_image = '/assets/default-avatar.png';
        }
        res.json(user);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
// Update profile
app.put('/user/profile', authMiddleware, upload.single('profile_image'), async (req, res) => {
    const { name, email } = req.body;
    const profile_image = req.file ? `/uploads/${req.file.filename}` : undefined;
    try {
        const updates = [];
        const values = [];
        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (email) {
            updates.push('email = ?');
            values.push(email);
        }
        if (profile_image) {
            updates.push('profile_image = ?');
            values.push(profile_image);
        }
        values.push(req.session.userId);
        const sql = `UPDATE user_gameshop_web SET ${updates.join(', ')} WHERE id = ?`;
        await db.query(sql, values);
        res.json({ message: 'Profile updated successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
// Logout
app.post('/logout', authMiddleware, (req, res) => {
    req.session.destroy((err) => {
        if (err)
            return res.status(500).json({ message: 'Logout failed' });
        res.json({ message: 'Logged out' });
    });
});
// ------------------- Start server -------------------
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await createDefaultAdmin();
});
