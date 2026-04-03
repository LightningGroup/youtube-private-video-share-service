const jobQueue = require('./jobQueue');
const jobStore = require('./jobStore');
const loginSessionService = require('./loginSessionService');
const connectionService = require('./connectionService');

const JOB_STATUS = {
  QUEUED: 'queued',
  CLAIMED: 'claimed',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
  NEEDS_REAUTH: 'needs_reauth',
};

class AgentJobService {
  /**
   * 로그인 세션 완료를 기록한다.
   */
  async completeLoginSession({ agentId, loginSessionId }) {
    const loginSession = await loginSessionService.getLoginSessionForAgentOrThrow(loginSessionId);

    return loginSessionService.completeLoginSession({
      loginSessionId,
      userId: loginSession.userId,
    });
  }

  /**
   * 로그인 세션 실패를 기록한다.
   */
  async failLoginSession({ agentId, loginSessionId }) {
    const loginSession = await loginSessionService.getLoginSessionForAgentOrThrow(loginSessionId);

    await connectionService.markReauthRequired({
      connectionId: loginSession.connectionId,
      userId: loginSession.userId,
    }).catch(() => {});

    return loginSessionService.failLoginSession({
      loginSessionId,
      userId: loginSession.userId,
    });
  }

  /**
   * agent가 실행할 수 있는 다음 job을 claim한다.
   */
  async claimNextJob({ agentId }) {
    const queuedJob = await jobStore.findNextQueuedJob();
    if (!queuedJob) {
      return null;
    }

    return jobQueue.claim({
      agentId,
      jobId: queuedJob.jobId,
    });
  }

  async completeJob({ agentId, jobId, summary, results }) {
    return jobQueue.complete({
      agentId,
      jobId,
      status: this.resolveCompletionStatus(summary),
      summary,
      results,
    });
  }

  async failJob({ agentId, jobId, errorCode, message, needsReauth }) {
    const job = await jobStore.get(jobId);
    if (!job) {
      const error = new Error('Job not found');
      error.status = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    if (needsReauth) {
      await connectionService.markReauthRequired({
        connectionId: job.request.connectionId,
        userId: job.request.userId,
      }).catch(() => {});
    }

    const status = needsReauth ? JOB_STATUS.NEEDS_REAUTH : JOB_STATUS.FAILED;

    return jobQueue.complete({
      agentId,
      jobId,
      status,
      summary: {
        totalVideos: job.request.videoIds.length,
        successCount: 0,
        failedCount: job.request.videoIds.length,
      },
      results: [],
      errorCode,
      message,
    });
  }

  resolveCompletionStatus(summary) {
    const totalVideos = Number(summary?.totalVideos || 0);
    const successCount = Number(summary?.successCount || 0);
    const failedCount = Number(summary?.failedCount || 0);

    if (failedCount === 0 && successCount === totalVideos) {
      return JOB_STATUS.SUCCESS;
    }

    if (successCount > 0 && failedCount > 0) {
      return JOB_STATUS.PARTIAL;
    }

    return JOB_STATUS.FAILED;
  }
}

module.exports = new AgentJobService();
