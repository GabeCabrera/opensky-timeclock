const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Support standard Authorization header first
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Allow token via query param (primarily for SSE EventSource which can't set Authorization header nicely)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required', code: 'AUTH_REQUIRED' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };