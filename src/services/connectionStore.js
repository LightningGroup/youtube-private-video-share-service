const path = require('path');
const config = require('../config');
const { ensureDir, pathExists, readJson, writeJson } = require('../utils/fs');

class ConnectionStore {
  constructor() {
    this.connectionsDir = config.connectionsDir;
  }

  async init() {
    await ensureDir(this.connectionsDir);
  }

  buildConnectionPath(connectionId) {
    return path.join(this.connectionsDir, `${connectionId}.json`);
  }

  async create(connection) {
    await writeJson(this.buildConnectionPath(connection.id), connection);
    return connection;
  }

  async update(connection) {
    await writeJson(this.buildConnectionPath(connection.id), connection);
    return connection;
  }

  async get(connectionId) {
    const filePath = this.buildConnectionPath(connectionId);
    if (!(await pathExists(filePath))) {
      return null;
    }

    return readJson(filePath);
  }
}

module.exports = new ConnectionStore();
