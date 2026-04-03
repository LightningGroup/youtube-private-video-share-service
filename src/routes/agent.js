const express = require('express');
const agentAuth = require('../middleware/agentAuth');
const agentJobService = require('../services/agentJobService');

const router = express.Router();

router.post('/login-sessions/:loginSessionId/complete', agentAuth, async (req, res, next) => {
  try {
    const loginSession = await agentJobService.completeLoginSession({
      agentId: req.agent.agentId,
      loginSessionId: req.params.loginSessionId,
    });

    return res.json({ loginSession });
  } catch (error) {
    return next(error);
  }
});

router.post('/login-sessions/:loginSessionId/fail', agentAuth, async (req, res, next) => {
  try {
    const loginSession = await agentJobService.failLoginSession({
      agentId: req.agent.agentId,
      loginSessionId: req.params.loginSessionId,
    });

    return res.json({ loginSession });
  } catch (error) {
    return next(error);
  }
});

router.post('/jobs/claim', agentAuth, async (req, res, next) => {
  try {
    const job = await agentJobService.claimNextJob({
      agentId: req.agent.agentId,
    });

    return res.json({ job });
  } catch (error) {
    return next(error);
  }
});

router.post('/jobs/:jobId/complete', agentAuth, async (req, res, next) => {
  try {
    const job = await agentJobService.completeJob({
      agentId: req.agent.agentId,
      jobId: req.params.jobId,
      summary: req.body?.summary,
      results: req.body?.results,
    });

    return res.json({ job });
  } catch (error) {
    return next(error);
  }
});

router.post('/jobs/:jobId/fail', agentAuth, async (req, res, next) => {
  try {
    const job = await agentJobService.failJob({
      agentId: req.agent.agentId,
      jobId: req.params.jobId,
      errorCode: req.body?.errorCode,
      message: req.body?.message,
      needsReauth: Boolean(req.body?.needsReauth),
    });

    return res.json({ job });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
