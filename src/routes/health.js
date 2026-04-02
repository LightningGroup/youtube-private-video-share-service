const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: config.serviceName,
    version: config.version,
  });
});

module.exports = router;
