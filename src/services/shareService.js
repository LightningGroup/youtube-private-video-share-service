const connectionService = require('./connectionService');
const { runYoutubeStudioShare } = require('./youtubeStudioShare');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONNECTION_ID_REGEX = /^conn_[a-z0-9]{12}$/;
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{6,20}$/;
const LOCALES = new Set(['auto', 'ko', 'en']);
const JOB_STATUS = {
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
  NEEDS_REAUTH: 'needs_reauth',
};
const AUTHENTICATION_ERROR_CODES = new Set(['AUTHENTICATION_REQUIRED', 'CONNECTION_REAUTH_REQUIRED']);

function normalizeArray(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

/**
 * 공유 요청 payload를 정규화하고 유효성 검증한다.
 * 라우트에서 job enqueue 직전에 호출한다.
 */
function validateShareRequest(body) {
  if (!body || typeof body !== 'object') {
    const error = new Error('Request body is required');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  const connectionId = String(body.connectionId || '').trim();
  const videoIds = normalizeArray(Array.isArray(body.videoIds) ? body.videoIds : []);
  const emailsToAdd = normalizeArray(Array.isArray(body.emailsToAdd) ? body.emailsToAdd : []).map((v) => v.toLowerCase());
  const locale = body.locale || 'auto';

  if (!CONNECTION_ID_REGEX.test(connectionId)) {
    const error = new Error('connectionId is required');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  if (videoIds.length === 0) {
    const error = new Error('videoIds is required');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  if (emailsToAdd.length === 0) {
    const error = new Error('emailsToAdd is required');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  if (!videoIds.every((videoId) => VIDEO_ID_REGEX.test(videoId))) {
    const error = new Error('videoIds contains invalid value');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  if (!emailsToAdd.every((email) => EMAIL_REGEX.test(email))) {
    const error = new Error('emailsToAdd contains invalid email');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  if (!LOCALES.has(locale)) {
    const error = new Error('locale must be one of auto, ko, en');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  return {
    connectionId,
    videoIds,
    emailsToAdd,
    disableEmailNotification: Boolean(body.disableEmailNotification),
    dryRun: Boolean(body.dryRun),
    locale,
  };
}

/**
 * 공유 작업 결과를 집계해 최종 job 상태를 확정한다.
 * 큐 워커에서 실제 YouTube Studio 자동화 실행 시 사용한다.
 */
async function runShareJob(job) {
  const request = job.request;
  try {
    const { connection, storageStatePath } = await connectionService.getUsableConnectionOrThrow({
      connectionId: request.connectionId,
      userId: request.userId,
    });

    const results = await runYoutubeStudioShare(job, {
      ...request,
      storageStatePath,
      connectionId: connection.id,
    });

    const successCount = results.filter((item) => item.status === 'success').length;
    const failedCount = results.length - successCount;

    let status = JOB_STATUS.SUCCESS;
    if (failedCount > 0 && successCount > 0) {
      status = JOB_STATUS.PARTIAL;
    }
    if (failedCount === results.length) {
      status = JOB_STATUS.FAILED;
    }

    return {
      ...job,
      status,
      summary: {
        totalVideos: request.videoIds.length,
        successCount,
        failedCount,
      },
      results,
    };
  } catch (error) {
    if (!AUTHENTICATION_ERROR_CODES.has(error.code)) {
      throw error;
    }

    await connectionService.markReauthRequired({
      connectionId: request.connectionId,
      userId: request.userId,
    }).catch(() => {});

    job.addLog('warn', error.message);

    return {
      ...job,
      status: JOB_STATUS.NEEDS_REAUTH,
      summary: {
        totalVideos: request.videoIds.length,
        successCount: 0,
        failedCount: request.videoIds.length,
      },
      results: [],
    };
  }
}

module.exports = {
  validateShareRequest,
  runShareJob,
};
