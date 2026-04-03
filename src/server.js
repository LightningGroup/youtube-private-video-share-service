require('dotenv').config();
const app = require('./app');
const config = require('./config');
const { ensureDir } = require('./utils/fs');
const sessionService = require('./services/sessionService');
const jobStore = require('./services/jobStore');
const connectionStore = require('./services/connectionStore');
const loginSessionService = require('./services/loginSessionService');

async function bootstrap() {
  await Promise.all([
    ensureDir(config.storageStatesDir),
    ensureDir(config.connectionsDir),
    ensureDir(config.loginSessionsDir),
    ensureDir(config.artifactsDir),
    ensureDir(config.jobsDir),
    ensureDir(config.tmpDir),
    sessionService.init(),
    connectionStore.init(),
    loginSessionService.init(),
    jobStore.init(),
  ]);

  app.listen(config.port, () => {
    console.log(`[${config.serviceName}] listening on port ${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
