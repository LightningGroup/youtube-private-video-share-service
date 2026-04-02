const express = require('express');
const fs = require('fs/promises');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const auth = require('../middleware/auth');
const sessionService = require('../services/sessionService');

const router = express.Router();

const upload = multer({
  dest: config.tmpDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext && ext !== '.json') {
      const error = new Error('storageState must be a JSON file');
      error.status = 400;
      error.code = 'INVALID_STORAGE_STATE';
      return cb(error);
    }
    return cb(null, true);
  },
});

router.get('/session/status', auth, async (_req, res, next) => {
  try {
    const status = await sessionService.getStatus();
    return res.json(status);
  } catch (error) {
    return next(error);
  }
});

router.post('/session/storage-state', auth, upload.single('storageState'), async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('storageState file is required');
      err.status = 400;
      err.code = 'INVALID_REQUEST';
      throw err;
    }

    const status = await sessionService.saveStorageState(req.file.path);
    await fs.unlink(req.file.path).catch(() => {});
    return res.json(status);
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    return next(error);
  }
});

router.delete('/session/storage-state', auth, async (_req, res, next) => {
  try {
    const status = await sessionService.deleteStorageState();
    return res.json(status);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
