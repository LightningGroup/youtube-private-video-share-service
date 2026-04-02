require('dotenv').config();
const path = require('path');
const app = require('./app');
const config = require('./config');
const { ensureDir } = require('./utils/fs');
const sessionService = require('./services/sessionService');
const jobStore = require('./services/jobStore');
const jobQueue = require('./services/jobQueue');
const { runShareJob } = require('./services/shareService');

async function bootstrap() {
  await Promise.all([
    ensureDir(path.dirname(config.storageStatePath)),
    ensureDir(config.artifactsDir),
    ensureDir(config.jobsDir),
    ensureDir(config.tmpDir),
    sessionService.init(),
    jobStore.init(),
  ]);

  jobQueue.setWorker(runShareJob);

  app.listen(config.port, () => {
    console.log(`[${config.serviceName}] listening on port ${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
