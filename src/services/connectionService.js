const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { pathExists } = require('../utils/fs');
const connectionStore = require('./connectionStore');

const CONNECTION_STATUS = {
  PENDING_LOGIN: 'pending_login',
  AUTHENTICATED: 'authenticated',
  REAUTH_REQUIRED: 'reauth_required',
};

function toIsoNow() {
  return new Date().toISOString();
}

class ConnectionService {
  /**
   * 사용자별 YouTube 연결 메타데이터를 생성한다.
   */
  async createConnection({ userId, channelLabel }) {
    const now = toIsoNow();
    const connection = {
      id: `conn_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      status: CONNECTION_STATUS.PENDING_LOGIN,
      channelLabel: String(channelLabel || '').trim() || null,
      storageStatePath: null,
      lastAuthenticatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await connectionStore.create(connection);
    return connection;
  }

  /**
   * connection 소유권을 검증하고 메타데이터를 반환한다.
   */
  async getConnectionOrThrow({ connectionId, userId }) {
    const connection = await connectionStore.get(connectionId);
    if (!connection) {
      const error = new Error('Connection not found');
      error.status = 404;
      error.code = 'CONNECTION_NOT_FOUND';
      throw error;
    }

    if (connection.userId !== userId) {
      const error = new Error('Connection not found');
      error.status = 404;
      error.code = 'CONNECTION_NOT_FOUND';
      throw error;
    }

    return connection;
  }

  /**
   * 사용자의 connection 목록을 최신순으로 반환한다.
   */
  async listConnections({ userId }) {
    const entries = await Promise.all(
      (await fs.readdir(config.connectionsDir))
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => connectionStore.get(path.basename(fileName, '.json')))
    );

    return (entries ?? [])
      .filter(Boolean)
      .filter((connection) => connection.userId === userId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  buildStorageStatePath(connectionId) {
    return path.join(config.storageStatesDir, `${connectionId}.json`);
  }

  async markAuthenticated({ connectionId, userId }) {
    const connection = await this.getConnectionOrThrow({ connectionId, userId });
    const updatedConnection = {
      ...connection,
      status: CONNECTION_STATUS.AUTHENTICATED,
      storageStatePath: this.buildStorageStatePath(connectionId),
      lastAuthenticatedAt: toIsoNow(),
      updatedAt: toIsoNow(),
    };

    await connectionStore.update(updatedConnection);
    return updatedConnection;
  }

  async markPendingLogin({ connectionId, userId }) {
    const connection = await this.getConnectionOrThrow({ connectionId, userId });
    const updatedConnection = {
      ...connection,
      status: CONNECTION_STATUS.PENDING_LOGIN,
      updatedAt: toIsoNow(),
    };

    await connectionStore.update(updatedConnection);
    return updatedConnection;
  }

  async markReauthRequired({ connectionId, userId }) {
    const connection = await this.getConnectionOrThrow({ connectionId, userId });
    const updatedConnection = {
      ...connection,
      status: CONNECTION_STATUS.REAUTH_REQUIRED,
      updatedAt: toIsoNow(),
    };

    await connectionStore.update(updatedConnection);
    return updatedConnection;
  }

  /**
   * 실행 가능한 연결과 storageState 경로를 반환한다.
   */
  async getUsableConnectionOrThrow({ connectionId, userId }) {
    const connection = await this.getConnectionOrThrow({ connectionId, userId });
    const storageStatePath = this.buildStorageStatePath(connection.id);

    if (connection.status !== CONNECTION_STATUS.AUTHENTICATED) {
      const error = new Error('Connection requires authentication');
      error.status = 400;
      error.code = 'CONNECTION_REAUTH_REQUIRED';
      throw error;
    }

    if (!(await pathExists(storageStatePath))) {
      const error = new Error('Connection storage state not found');
      error.status = 400;
      error.code = 'CONNECTION_REAUTH_REQUIRED';
      throw error;
    }

    return {
      connection,
      storageStatePath,
    };
  }
}

module.exports = new ConnectionService();
