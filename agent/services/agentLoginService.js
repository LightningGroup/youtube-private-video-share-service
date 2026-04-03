const { spawn } = require('child_process');
const path = require('path');
const serverClient = require('./serverClient');

class AgentLoginService {
  async run(loginSessionId) {
    const scriptPath = path.resolve(__dirname, '../../scripts/interactiveLogin.js');

    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        scriptPath,
        '--agent-login-session-id',
        loginSessionId,
      ], {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..', '..'),
      });

      child.on('exit', async (code) => {
        try {
          if (code === 0) {
            await serverClient.completeLoginSession({ loginSessionId });
            resolve();
            return;
          }

          await serverClient.failLoginSession({ loginSessionId });
          reject(new Error(`Agent login failed with exit code ${code}`));
        } catch (error) {
          reject(error);
        }
      });

      child.on('error', reject);
    });
  }
}

module.exports = new AgentLoginService();
