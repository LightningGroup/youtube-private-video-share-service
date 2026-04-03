const config = require('../config');
const serverClient = require('./serverClient');
const agentShareService = require('./agentShareService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AgentRunner {
  async runOnce() {
    const claimed = await serverClient.claimNextJob();
    const job = claimed?.job;

    if (!job) {
      return false;
    }

    const outcome = await agentShareService.runJob(job);
    if (outcome.ok) {
      await serverClient.completeJob({
        jobId: job.jobId,
        summary: outcome.summary,
        results: outcome.results,
      });
      return true;
    }

    await serverClient.failJob({
      jobId: job.jobId,
      errorCode: outcome.errorCode,
      message: outcome.message,
      needsReauth: outcome.needsReauth,
    });
    return true;
  }

  async runLoop() {
    while (true) {
      try {
        const handled = await this.runOnce();
        if (config.runOnce) {
          return;
        }

        if (handled) {
          continue;
        }
      } catch (error) {
        console.error(`[agent:${config.agentId}]`, error.message);
        if (config.runOnce) {
          throw error;
        }
      }

      await sleep(config.pollIntervalMs);
    }
  }
}

module.exports = new AgentRunner();
