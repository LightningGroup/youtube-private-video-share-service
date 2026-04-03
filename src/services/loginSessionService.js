const crypto = require('crypto');
const config = require('../config');
const connectionService = require('./connectionService');
const loginSessionStore = require('./loginSessionStore');

const LOGIN_SESSION_STATUS = {
  READY: 'ready',
  WAITING_FOR_USER: 'waiting_for_user',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  FAILED: 'failed',
};

function toIsoNow() {
  return new Date().toISOString();
}

function buildExpiresAt() {
  return new Date(Date.now() + config.loginSessionTtlMs).toISOString();
}

function isExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
}

class LoginSessionService {
  async init() {
    await loginSessionStore.init();
  }

  /**
   * connection 기준 로그인 세션을 생성한다.
   */
  async createLoginSession({ connectionId, userId }) {
    const connection = await connectionService.getConnectionOrThrow({ connectionId, userId });
    await connectionService.markPendingLogin({ connectionId, userId });

    const now = toIsoNow();
    const loginSession = {
      id: `ls_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      connectionId: connection.id,
      status: LOGIN_SESSION_STATUS.READY,
      loginUrl: config.googleSigninUrl,
      startedAt: now,
      completedAt: null,
      expiresAt: buildExpiresAt(),
      createdAt: now,
      processId: null,
      processStartedAt: null,
      updatedAt: now,
    };

    await loginSessionStore.create(loginSession);
    return this.transitionToWaitingForUser(loginSession.id, userId);
  }

  /**
   * 로그인 세션을 조회하고 만료 상태를 보정한다.
   */
  async getLoginSessionOrThrow({ loginSessionId, userId }) {
    const loginSession = await loginSessionStore.get(loginSessionId);
    if (!loginSession) {
      const error = new Error('Login session not found');
      error.status = 404;
      error.code = 'LOGIN_SESSION_NOT_FOUND';
      throw error;
    }

    if (loginSession.userId !== userId) {
      const error = new Error('Login session not found');
      error.status = 404;
      error.code = 'LOGIN_SESSION_NOT_FOUND';
      throw error;
    }

    if (!isExpired(loginSession.expiresAt)) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.COMPLETED) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.EXPIRED) {
      return loginSession;
    }

    return this.expireLoginSession({ loginSessionId, userId });
  }

  /**
   * connection에 연결된 최근 로그인 세션을 반환한다.
   */
  async getLatestLoginSessionForConnection({ connectionId, userId }) {
    const items = await loginSessionStore.list();
    return (items ?? [])
      .filter((item) => item.userId === userId)
      .filter((item) => item.connectionId === connectionId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null;
  }

  async transitionToWaitingForUser(loginSessionId, userId) {
    const loginSession = await this.getLoginSessionOrThrow({ loginSessionId, userId });
    if (loginSession.status === LOGIN_SESSION_STATUS.WAITING_FOR_USER) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.COMPLETED) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.EXPIRED) {
      return loginSession;
    }

    const updatedLoginSession = {
      ...loginSession,
      status: LOGIN_SESSION_STATUS.WAITING_FOR_USER,
      updatedAt: toIsoNow(),
    };

    await loginSessionStore.update(updatedLoginSession);
    return updatedLoginSession;
  }

  /**
   * 브라우저 프로세스 정보를 로그인 세션에 기록한다.
   */
  async attachProcess({ loginSessionId, userId, processId }) {
    const loginSession = await this.getLoginSessionOrThrow({ loginSessionId, userId });
    if (loginSession.status === LOGIN_SESSION_STATUS.COMPLETED) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.EXPIRED) {
      return loginSession;
    }

    const updatedLoginSession = {
      ...loginSession,
      processId,
      processStartedAt: toIsoNow(),
      updatedAt: toIsoNow(),
    };

    await loginSessionStore.update(updatedLoginSession);
    return updatedLoginSession;
  }

  /**
   * 업로드된 세션 저장 이후 로그인 세션을 완료 처리한다.
   */
  async completeLoginSession({ loginSessionId, userId }) {
    const loginSession = await this.getLoginSessionOrThrow({ loginSessionId, userId });
    if (loginSession.status === LOGIN_SESSION_STATUS.COMPLETED) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.EXPIRED) {
      const error = new Error('Login session already expired');
      error.status = 400;
      error.code = 'LOGIN_SESSION_EXPIRED';
      throw error;
    }

    const updatedLoginSession = {
      ...loginSession,
      status: LOGIN_SESSION_STATUS.COMPLETED,
      completedAt: toIsoNow(),
      processId: null,
      updatedAt: toIsoNow(),
    };

    await loginSessionStore.update(updatedLoginSession);
    return updatedLoginSession;
  }

  async expireLoginSession({ loginSessionId, userId }) {
    const loginSession = await this.getLoginSessionOrThrowRaw({ loginSessionId, userId });
    if (loginSession.status === LOGIN_SESSION_STATUS.COMPLETED) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.EXPIRED) {
      return loginSession;
    }

    const updatedLoginSession = {
      ...loginSession,
      status: LOGIN_SESSION_STATUS.EXPIRED,
      processId: null,
      updatedAt: toIsoNow(),
    };

    await loginSessionStore.update(updatedLoginSession);
    return updatedLoginSession;
  }

  async failLoginSession({ loginSessionId, userId }) {
    const loginSession = await this.getLoginSessionOrThrowRaw({ loginSessionId, userId });
    if (loginSession.status === LOGIN_SESSION_STATUS.COMPLETED) {
      return loginSession;
    }

    if (loginSession.status === LOGIN_SESSION_STATUS.FAILED) {
      return loginSession;
    }

    const updatedLoginSession = {
      ...loginSession,
      status: LOGIN_SESSION_STATUS.FAILED,
      processId: null,
      updatedAt: toIsoNow(),
    };

    await loginSessionStore.update(updatedLoginSession);
    return updatedLoginSession;
  }

  async getLoginSessionOrThrowRaw({ loginSessionId, userId }) {
    const loginSession = await loginSessionStore.get(loginSessionId);
    if (!loginSession) {
      const error = new Error('Login session not found');
      error.status = 404;
      error.code = 'LOGIN_SESSION_NOT_FOUND';
      throw error;
    }

    if (loginSession.userId === userId) {
      return loginSession;
    }

    const error = new Error('Login session not found');
    error.status = 404;
    error.code = 'LOGIN_SESSION_NOT_FOUND';
    throw error;
  }

  /**
   * agent 내부 처리용으로 소유권 검증 없이 로그인 세션을 조회한다.
   */
  async getLoginSessionForAgentOrThrow(loginSessionId) {
    const loginSession = await loginSessionStore.get(loginSessionId);
    if (loginSession) {
      return loginSession;
    }

    const error = new Error('Login session not found');
    error.status = 404;
    error.code = 'LOGIN_SESSION_NOT_FOUND';
    throw error;
  }
}

module.exports = new LoginSessionService();
