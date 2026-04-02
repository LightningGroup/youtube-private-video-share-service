const path = require('path');
const fs = require('fs/promises');
const config = require('../config');
const { ensureDir, pathExists, deleteFile, readJson } = require('../utils/fs');

class SessionService {
  async init() {
    await ensureDir(path.dirname(config.storageStatePath));
  }

  async getStatus() {
    const hasStorageState = await pathExists(config.storageStatePath);
    let updatedAt = null;

    if (hasStorageState) {
      const stat = await fs.stat(config.storageStatePath);
      updatedAt = stat.mtime.toISOString();
    }

    return {
      authenticated: hasStorageState,
      hasStorageState,
      updatedAt,
    };
  }

  async saveStorageState(tempFilePath) {
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

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cookies) || !parsed.origins) {
      const err = new Error('storageState must include cookies and origins');
      err.status = 400;
      err.code = 'INVALID_STORAGE_STATE';
      throw err;
    }

    await ensureDir(path.dirname(config.storageStatePath));
    await fs.copyFile(tempFilePath, config.storageStatePath);

    return this.getStatus();
  }

  async deleteStorageState() {
    await deleteFile(config.storageStatePath);
    return this.getStatus();
  }

  async getStorageStatePathOrThrow() {
    if (!(await pathExists(config.storageStatePath))) {
      const err = new Error('No storageState.json uploaded');
      err.status = 400;
      err.code = 'NO_STORAGE_STATE';
      throw err;
    }

    const parsed = await readJson(config.storageStatePath);
    if (!parsed.cookies || !parsed.origins) {
      const err = new Error('Stored storage state is invalid');
      err.status = 400;
      err.code = 'INVALID_STORAGE_STATE';
      throw err;
    }

    return config.storageStatePath;
  }
}

module.exports = new SessionService();
