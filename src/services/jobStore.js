const path = require('path');
const fs = require('fs/promises');
const config = require('../config');
const { ensureDir, pathExists, readJson, writeJson } = require('../utils/fs');

class JobStore {
  constructor() {
    this.jobsDir = config.jobsDir;
  }

  async init() {
    await ensureDir(this.jobsDir);
  }

  buildJobPath(jobId) {
    return path.join(this.jobsDir, `${jobId}.json`);
  }

  async create(job) {
    await writeJson(this.buildJobPath(job.jobId), job);
    return job;
  }

  async update(job) {
    await writeJson(this.buildJobPath(job.jobId), job);
    return job;
  }

  async get(jobId) {
    const filePath = this.buildJobPath(jobId);
    if (!(await pathExists(filePath))) {
      return null;
    }
    return readJson(filePath);
  }

  async list(limit = config.jobHistoryLimit) {
    const files = await fs.readdir(this.jobsDir);
    const jobs = [];

    for (const fileName of files) {
      if (!fileName.endsWith('.json')) {
        continue;
      }
      const job = await readJson(path.join(this.jobsDir, fileName));
      jobs.push(job);
    }

    return jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async listByUserId(userId, limit = config.jobHistoryLimit) {
    const jobs = await this.list(Number.MAX_SAFE_INTEGER);
    return jobs
      .filter((job) => job.request?.userId === userId)
      .slice(0, limit);
  }

  async findNextQueuedJob() {
    const jobs = await this.list(Number.MAX_SAFE_INTEGER);
    return jobs.find((job) => job.status === 'queued') || null;
  }
}

module.exports = new JobStore();
