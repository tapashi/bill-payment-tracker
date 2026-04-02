const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { issueAuthCookie, clearAuthCookie, extractUser } = require('../auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await db.getUserByEmail(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await db.incrementFailedLogin(user.email);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await db.resetFailedLoginAndMarkLastLogin(user.id);
  issueAuthCookie(res, user);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

router.get('/me', (req, res) => {
  const user = extractUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    user: {
      id: user.sub,
      email: user.email,
      role: user.role,
    },
  });
});

module.exports = router;
