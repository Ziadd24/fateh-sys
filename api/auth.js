const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { verifyPassword, createSession, deleteSession } = require('../lib/auth');
const { asyncHandler } = require('./middleware');

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
  }

  // Get user
  const user = db.prepare('SELECT * FROM user WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  // Create session
  const token = createSession(user.user_id);

  res.json({
    token,
    user: {
      userId: user.user_id,
      username: user.username,
      role: user.role
    }
  });
}));

// POST /api/auth/logout
router.post('/logout', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    deleteSession(token);
  }
  res.json({ success: true });
}));

module.exports = router;
