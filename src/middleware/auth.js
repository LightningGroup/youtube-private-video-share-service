const config = require('../config');

function auth(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!config.adminToken || token !== config.adminToken) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing admin token',
      },
    });
  }

  return next();
}

module.exports = auth;
