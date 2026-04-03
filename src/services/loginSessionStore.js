const path = require('path');
const fs = require('fs/promises');
const config = require('../config');
const { ensureDir, pathExists, readJson, writeJson } = require('../utils/fs');

class LoginSessionStore {
  constructor() {
    this.loginSessionsDir = config.loginSessionsDir;
  }

  async init() {
    await ensureDir(this.loginSessionsDir);
  }

  buildLoginSessionPath(loginSessionId) {
    return path.join(this.loginSessionsDir, `${loginSessionId}.json`);
  }

  async create(loginSession) {
    await writeJson(this.buildLoginSessionPath(loginSession.id), loginSession);
    return loginSession;
  }

  async update(loginSession) {
    await writeJson(this.buildLoginSessionPath(loginSession.id), loginSession);
    return loginSession;
  }

  async get(loginSessionId) {
    const filePath = this.buildLoginSessionPath(loginSessionId);
    if (!(await pathExists(filePath))) {
      return null;
    }

    return readJson(filePath);
  }

  async list() {
    const files = await fs.readdir(this.loginSessionsDir);
    const items = await Promise.all(
      (files ?? [])
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => this.get(path.basename(fileName, '.json')))
    );

    return (items ?? []).filter(Boolean);
  }
}

module.exports = new LoginSessionStore();
