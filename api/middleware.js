const { validateSession } = require('../lib/auth');

/**
 * Async route handler wrapper.
 * Catches rejected promises and sync errors and forwards to Express error handler.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Central error handler middleware.
 */
function errorHandler(err, _req, res, _next) {
  console.error('API Error:', err);

  // SQLite constraint violations -> 409 or 400
  if (err.message && err.message.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'Duplicate entry', detail: err.message });
  }
  if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'Referenced record not found', detail: err.message });
  }
  if (err.message && err.message.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'Constraint violation', detail: err.message });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}

/**
 * Validate that required body fields exist. Returns 400 if missing.
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * Validates that specified fields in req.body are positive integers. Returns 400 if invalid.
 */
function requirePositiveInt(...fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        const parsed = parseInt(req.body[field], 10);
        if (isNaN(parsed) || parsed <= 0) {
          return res.status(400).json({ success: false, error: `${field} must be a positive integer` });
        }
        // Store the parsed value back in the body so routes don't have to re-parse it
        req.body[field] = parsed;
      }
    }
    next();
  };
}

/**
 * Authentication middleware.
 * Verifies session token from the Authorization header.
 * Bypasses checks in test environment to preserve E2E testing capabilities.
 */
function authenticate(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    req.user = { userId: 1, username: 'admin', role: 'admin' };
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'عذراً، يجب تسجيل الدخول للوصول إلى هذه الخدمة' });
  }

  const token = authHeader.replace('Bearer ', '');
  const user = validateSession(token);

  if (!user) {
    return res.status(401).json({ error: 'جلسة العمل منتهية أو غير صالحة. يرجى إعادة تسجيل الدخول' });
  }

  req.user = user;
  next();
}

module.exports = { asyncHandler, errorHandler, requireFields, requirePositiveInt, authenticate };
