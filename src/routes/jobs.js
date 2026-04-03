const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const auth = require('../middleware/auth');
const jobStore = require('../services/jobStore');
const jobQueue = require('../services/jobQueue');
const { validateShareRequest } = require('../services/shareService');

const router = express.Router();

function toJobListItem(job) {
  return {
    jobId: job.jobId,
    connectionId: job.request?.connectionId || null,
    status: job.status,
    claimedAt: job.claimedAt,
    claimedBy: job.claimedBy,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    summary: job.summary,
  };
}

router.post('/jobs/share', auth, async (req, res, next) => {
  try {
    const payload = validateShareRequest(req.body);
    const queued = await jobQueue.enqueue({
      ...payload,
      userId: req.auth.userId,
    });
    return res.json(queued);
  } catch (error) {
    return next(error);
  }
});

router.get('/jobs', auth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || config.jobHistoryLimit);
    const visibleJobs = await jobStore.listByUserId(req.auth.userId, limit);
    return res.json({
      items: visibleJobs.map(toJobListItem),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/jobs/:jobId', auth, async (req, res, next) => {
  try {
    const job = await jobStore.get(req.params.jobId);
    if (!job) {
      const err = new Error('Job not found');
      err.status = 404;
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }
    if (job.request?.userId !== req.auth.userId) {
      const err = new Error('Job not found');
      err.status = 404;
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }
    return res.json(job);
  } catch (error) {
    return next(error);
  }
});

router.get('/jobs/:jobId/artifacts/:fileName', auth, async (req, res, next) => {
  try {
    const { jobId, fileName } = req.params;
    const job = await jobStore.get(jobId);
    if (!job || job.request?.userId !== req.auth.userId) {
      return res.status(404).json({
        error: {
          code: 'ARTIFACT_NOT_FOUND',
          message: 'Artifact not found',
        },
      });
    }

    const safeName = path.basename(fileName);
    const artifactPath = path.join(config.artifactsDir, jobId, safeName);

    await fs.access(artifactPath);
    return res.download(artifactPath, safeName);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: {
          code: 'ARTIFACT_NOT_FOUND',
          message: 'Artifact not found',
        },
      });
    }
    return next(error);
  }
});

module.exports = router;
