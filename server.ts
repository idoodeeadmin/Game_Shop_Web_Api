import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// ------------------- Session types -------------------
declare module 'express-session' {
  interface SessionData {
    userId: number;
    role: string;
  }
}

// ------------------- Middleware -------------------
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      httpOnly: true
    }
  })
);

// ------------------- Multer -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// ------------------- MySQL Pool -------------------
const db = mysql.createPool({
  host: process.env.DB_HOST || '202.28.34.203',
  user: process.env.DB_USER || 'mb68_66011212155',
  password: process.env.DB_PASS || 'uKayQT6Ly2i(',
  database: process.env.DB_NAME || 'mb68_66011212155',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ------------------- Auth Middleware -------------------
function authMiddleware(req: any, res: any, next: any) {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

// ------------------- Routes -------------------

// Test
app.get('/', (req, res) => res.send('Hello World!'));

// Register
app.post('/register', upload.single('profile_image'), async (req: any, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

    const [existing] = await db.query('SELECT * FROM user_gameshop_web WHERE email = ?', [email]);
    if ((existing as any).length > 0) return res.status(400).json({ message: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const profile_image = req.file ? `/uploads/${req.file.filename}` : null;

    await db.query(
      'INSERT INTO user_gameshop_web (name, email, password, role, profile_image) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'user', profile_image]
    );

    res.json({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

  try {
    const [rows] = await db.query('SELECT * FROM user_gameshop_web WHERE email = ?', [email]);
    const user = (rows as any)[0];
    if (!user) return res.status(400).json({ message: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Incorrect password' });

    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      message: 'Login successful',
      role: user.role,
      id: user.id,
      name: user.name
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
app.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, profile_image FROM user_gameshop_web WHERE id = ?',
      [req.session.userId]
    );
    const user = (rows as any)[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.walletBalance = 0.98;

    const host = isProduction ? process.env.BACKEND_URL : `http://localhost:${PORT}`;
    user.profile_image = user.profile_image ? `${host}${user.profile_image}` : '/assets/default-avatar.png';

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
app.put('/user/profile', authMiddleware, upload.single('profile_image'), async (req: any, res) => {
  const { name, email } = req.body;
  const profile_image = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const updates: string[] = [];
    const values: any[] = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (profile_image) { updates.push('profile_image = ?'); values.push(profile_image); }

    values.push(req.session.userId);
    const sql = `UPDATE user_gameshop_web SET ${updates.join(', ')} WHERE id = ?`;
    await db.query(sql, values);

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout
app.post('/logout', authMiddleware, (req: any, res) => {
  req.session.destroy((err: any) => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    res.json({ message: 'Logged out' });
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});
