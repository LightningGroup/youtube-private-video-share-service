const connectionService = require('../../src/services/connectionService');
const { runYoutubeStudioShare } = require('../../src/services/youtubeStudioShare');

const AUTHENTICATION_ERROR_CODES = new Set(['AUTHENTICATION_REQUIRED', 'CONNECTION_REAUTH_REQUIRED']);

function createAgentJobLogger(job) {
  return {
    ...job,
    logs: job.logs ?? [],
    addLog(level, message) {
      this.logs.push({
        time: new Date().toISOString(),
        level,
        message,
      });
    },
  };
}

class AgentShareService {
  async runJob(job) {
    const runtimeJob = createAgentJobLogger(job);
    const storageStatePath = connectionService.buildStorageStatePath(job.request.connectionId);

    try {
      const results = await runYoutubeStudioShare(runtimeJob, {
        ...job.request,
        storageStatePath,
        connectionId: job.request.connectionId,
      });

      const successCount = results.filter((item) => item.status === 'success').length;
      const failedCount = results.length - successCount;

      return {
        ok: true,
        summary: {
          totalVideos: job.request.videoIds.length,
          successCount,
          failedCount,
        },
        results,
      };
    } catch (error) {
      const needsReauth = AUTHENTICATION_ERROR_CODES.has(error.code);
      return {
        ok: false,
        errorCode: error.code || 'AGENT_JOB_FAILED',
        message: error.message,
        needsReauth,
      };
    }
  }
}

module.exports = new AgentShareService();
