const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { ensureDir, pathExists, deleteFile, readJson } = require('../utils/fs');
const connectionService = require('./connectionService');
const loginSessionService = require('./loginSessionService');

class SessionService {
  async init() {
    await ensureDir(config.storageStatesDir);
  }

  /**
   * connection 기준 storageState 존재 여부를 조회한다.
   */
  async getStatus({ connectionId, userId }) {
    const connection = await connectionService.getConnectionOrThrow({ connectionId, userId });
    const storageStatePath = connectionService.buildStorageStatePath(connection.id);
    const hasStorageState = await pathExists(storageStatePath);
    let updatedAt = null;

    if (hasStorageState) {
      const stat = await fs.stat(storageStatePath);
      updatedAt = stat.mtime.toISOString();
    }

    return {
      connectionId: connection.id,
      connectionStatus: connection.status,
      authenticated: hasStorageState,
      hasStorageState,
      updatedAt,
    };
  }

  /**
   * 업로드된 storageState를 특정 connection에 저장한다.
   */
  async saveStorageState({ connectionId, loginSessionId, tempFilePath, userId }) {
    await connectionService.getConnectionOrThrow({ connectionId, userId });
    const raw = await fs.readFile(tempFilePath, 'utf-8');
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      const err = new Error('Invalid JSON file');
      err.status = 400;
      err.code = 'INVALID_STORAGE_STATE';
      throw err;
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
      const err = new Error('storageState must include cookies and origins');
      err.status = 400;
      err.code = 'INVALID_STORAGE_STATE';
      throw err;
    }

    const storageStatePath = connectionService.buildStorageStatePath(connectionId);
    await ensureDir(path.dirname(storageStatePath));
    await fs.copyFile(tempFilePath, storageStatePath);
    await connectionService.markAuthenticated({ connectionId, userId });

    if (loginSessionId) {
      await loginSessionService.completeLoginSession({ loginSessionId, userId });
    }

    const status = await this.getStatus({ connectionId, userId });
    return {
      ok: true,
      message: 'storageState uploaded',
      ...status,
    };
  }

  /**
   * connection의 저장된 storageState를 삭제한다.
   */
  async deleteStorageState({ connectionId, userId }) {
    await connectionService.getConnectionOrThrow({ connectionId, userId });
    const storageStatePath = connectionService.buildStorageStatePath(connectionId);
    await deleteFile(storageStatePath);
    await connectionService.markReauthRequired({ connectionId, userId });

    const loginSession = await loginSessionService.getLatestLoginSessionForConnection({
      connectionId,
      userId,
    }).catch(() => null);

    if (loginSession?.status === 'waiting_for_user') {
      await loginSessionService.failLoginSession({
        loginSessionId: loginSession.id,
        userId,
      }).catch(() => {});
    }

    return {
      ok: true,
      message: 'storageState deleted',
      connectionId,
    };
  }

  /**
   * 실행 가능한 storageState 경로를 반환한다.
   */
  async getStorageStatePathOrThrow({ connectionId, userId }) {
    const connection = await connectionService.getConnectionOrThrow({ connectionId, userId });
    const storageStatePath = connectionService.buildStorageStatePath(connection.id);

    if (!(await pathExists(storageStatePath))) {
      const err = new Error('No storageState.json uploaded for this connection');
      err.status = 400;
      err.code = 'CONNECTION_REAUTH_REQUIRED';
      throw err;
    }

    const parsed = await readJson(storageStatePath);
    if (!Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
      const err = new Error('Stored storage state is invalid');
      err.status = 400;
      err.code = 'INVALID_STORAGE_STATE';
      throw err;
    }

    return storageStatePath;
  }
}

module.exports = new SessionService();
