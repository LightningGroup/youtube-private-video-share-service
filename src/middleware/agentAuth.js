const config = require('../config');

const AGENT_ID_HEADER = 'x-agent-id';

function agentAuth(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const agentId = String(req.header(AGENT_ID_HEADER) || '').trim();

  if (!config.adminToken || token !== config.adminToken) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing admin token',
      },
    });
  }

  if (!agentId) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing agent id',
      },
    });
  }

  req.agent = { agentId };
  return next();
}

module.exports = agentAuth;
