const crypto = require('crypto');
const config = require('../config');
const jobStore = require('./jobStore');

class JobQueue {
  constructor() {
    this.queue = [];
  }

  async enqueue(requestPayload) {
    const now = new Date().toISOString();
    const job = {
      jobId: `job_${crypto.randomBytes(6).toString('hex')}`,
      status: 'queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      claimedAt: null,
      claimedBy: null,
      request: requestPayload,
      summary: {
        totalVideos: requestPayload.videoIds.length,
        successCount: 0,
        failedCount: 0,
      },
      results: [],
      logs: [],
    };

    await jobStore.create(job);
    return { jobId: job.jobId, status: 'queued' };
  }

  async claim({ agentId, jobId }) {
    const job = await jobStore.get(jobId);
    if (!job) {
      const error = new Error('Job not found');
      error.status = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    if (job.status !== 'queued') {
      const error = new Error('Job is not claimable');
      error.status = 409;
      error.code = 'JOB_NOT_CLAIMABLE';
      throw error;
    }

    const updatedJob = {
      ...job,
      status: 'claimed',
      claimedAt: new Date().toISOString(),
      claimedBy: agentId,
      startedAt: new Date().toISOString(),
      logs: [
        ...(job.logs ?? []),
        {
          time: new Date().toISOString(),
          level: 'info',
          message: `Claimed by agent ${agentId}`,
        },
      ],
    };

    await jobStore.update(updatedJob);
    return updatedJob;
  }

  async complete({ agentId, jobId, status, summary, results, errorCode, message }) {
    const job = await jobStore.get(jobId);
    if (!job) {
      const error = new Error('Job not found');
      error.status = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    if (job.claimedBy !== agentId) {
      const error = new Error('Job is claimed by another agent');
      error.status = 409;
      error.code = 'JOB_CLAIM_MISMATCH';
      throw error;
    }

    const updatedJob = {
      ...job,
      status,
      finishedAt: new Date().toISOString(),
      summary: summary || job.summary,
      results: results || job.results,
      logs: [
        ...(job.logs ?? []),
        {
          time: new Date().toISOString(),
          level: status === 'failed' || status === 'needs_reauth' ? 'error' : 'info',
          message: message || `Completed by agent ${agentId}`,
          errorCode: errorCode || null,
        },
      ],
    };

    await jobStore.update(updatedJob);
    await this.enforceJobLimit();
    return updatedJob;
  }

  async enforceJobLimit() {
    const jobs = await jobStore.list(config.jobHistoryLimit + 50);
    if (jobs.length <= config.jobHistoryLimit) {
      return;
    }

    const excess = jobs.slice(config.jobHistoryLimit);
    const fs = require('fs/promises');
    const path = require('path');

    for (const job of excess) {
      await fs.unlink(path.join(config.jobsDir, `${job.jobId}.json`)).catch(() => {});
    }
  }
}

module.exports = new JobQueue();
