const express = require('express');
const auth = require('../middleware/auth');
const connectionService = require('../services/connectionService');
const loginSessionLauncher = require('../services/loginSessionLauncher');
const loginSessionService = require('../services/loginSessionService');
const sessionService = require('../services/sessionService');

const router = express.Router();

function toConnectionResponse(connection) {
  return {
    id: connection.id,
    status: connection.status,
    channelLabel: connection.channelLabel,
    lastAuthenticatedAt: connection.lastAuthenticatedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

router.get('/connections', auth, async (req, res, next) => {
  try {
    const items = await connectionService.listConnections({ userId: req.auth.userId });
    return res.json({
      items: items.map(toConnectionResponse),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/connections', auth, async (req, res, next) => {
  try {
    const connection = await connectionService.createConnection({
      userId: req.auth.userId,
      channelLabel: req.body?.channelLabel,
    });

    return res.status(201).json({
      connection: toConnectionResponse(connection),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/connections/:connectionId', auth, async (req, res, next) => {
  try {
    const connection = await connectionService.getConnectionOrThrow({
      connectionId: req.params.connectionId,
      userId: req.auth.userId,
    });
    const sessionStatus = await sessionService.getStatus({
      connectionId: connection.id,
      userId: req.auth.userId,
    });

    return res.json({
      connection: {
        ...toConnectionResponse(connection),
        authenticated: sessionStatus.authenticated,
        hasStorageState: sessionStatus.hasStorageState,
        storageStateUpdatedAt: sessionStatus.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/connections/:connectionId/login-sessions', auth, async (req, res, next) => {
  try {
    const loginSession = await loginSessionService.createLoginSession({
      connectionId: req.params.connectionId,
      userId: req.auth.userId,
    });

    return res.status(201).json({
      loginSession,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/login-sessions/:loginSessionId', auth, async (req, res, next) => {
  try {
    const loginSession = await loginSessionService.getLoginSessionOrThrow({
      loginSessionId: req.params.loginSessionId,
      userId: req.auth.userId,
    });

    return res.json({
      loginSession,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login-sessions/:loginSessionId/start', auth, async (req, res, next) => {
  try {
    const loginSession = await loginSessionLauncher.start({
      loginSessionId: req.params.loginSessionId,
      userId: req.auth.userId,
    });

    return res.json({
      loginSession,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login-sessions/:loginSessionId/expire', auth, async (req, res, next) => {
  try {
    const loginSession = await loginSessionService.expireLoginSession({
      loginSessionId: req.params.loginSessionId,
      userId: req.auth.userId,
    });

    return res.json({
      loginSession,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
