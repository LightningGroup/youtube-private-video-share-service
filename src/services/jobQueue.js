const crypto = require('crypto');
const config = require('../config');
const jobStore = require('./jobStore');

class JobQueue {
  constructor() {
    this.queue = [];
    this.running = false;
    this.worker = null;
  }

  setWorker(workerFn) {
    this.worker = workerFn;
  }

  async enqueue(requestPayload) {
    const now = new Date().toISOString();
    const job = {
      jobId: `job_${crypto.randomBytes(6).toString('hex')}`,
      status: 'queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
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
    this.queue.push(job.jobId);
    this.run().catch((error) => {
      console.error('Queue run error', error);
    });

    return { jobId: job.jobId, status: 'queued' };
  }

  async run() {
    if (this.running || !this.worker) {
      return;
    }

    this.running = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = await jobStore.get(jobId);
      if (!job) continue;

      job.status = 'running';
      job.startedAt = new Date().toISOString();
      await jobStore.update(job);

      try {
        const updatedJob = await this.worker(this.wrapJob(job));
        updatedJob.finishedAt = new Date().toISOString();
        await jobStore.update(updatedJob);
      } catch (error) {
        job.status = 'failed';
        job.finishedAt = new Date().toISOString();
        job.logs.push({
          time: new Date().toISOString(),
          level: 'error',
          message: `Unexpected worker error: ${error.message}`,
        });
        await jobStore.update(job);
      }

      await this.enforceJobLimit();
    }

    this.running = false;
  }

  wrapJob(job) {
    return {
      ...job,
      addLog: (level, message) => {
        job.logs.push({
          time: new Date().toISOString(),
          level,
          message,
        });
      },
    };
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
