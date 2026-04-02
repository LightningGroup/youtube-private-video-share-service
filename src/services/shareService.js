const sessionService = require('./sessionService');
const { runYoutubeStudioShare } = require('./youtubeStudioShare');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{6,20}$/;
const LOCALES = new Set(['auto', 'ko', 'en']);

function normalizeArray(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function validateShareRequest(body) {
  if (!body || typeof body !== 'object') {
    const error = new Error('Request body is required');
    error.status = 400;
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  const videoIds = normalizeArray(Array.isArray(body.videoIds) ? body.videoIds : []);
  const emailsToAdd = normalizeArray(Array.isArray(body.emailsToAdd) ? body.emailsToAdd : []).map((v) => v.toLowerCase());
  const locale = body.locale || 'auto';

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
    videoIds,
    emailsToAdd,
    disableEmailNotification: Boolean(body.disableEmailNotification),
    dryRun: Boolean(body.dryRun),
    locale,
  };
}

async function runShareJob(job) {
  const request = job.request;
  const storageStatePath = await sessionService.getStorageStatePathOrThrow();

  const results = await runYoutubeStudioShare(job, {
    ...request,
    storageStatePath,
  });

  const successCount = results.filter((item) => item.status === 'success').length;
  const failedCount = results.length - successCount;

  let status = 'success';
  if (failedCount > 0 && successCount > 0) {
    status = 'partial';
  } else if (failedCount === results.length) {
    status = 'failed';
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
}

module.exports = {
  validateShareRequest,
  runShareJob,
};
