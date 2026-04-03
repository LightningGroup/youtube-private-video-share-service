const path = require('path');
const { spawn } = require('child_process');
const loginSessionService = require('./loginSessionService');

class LoginSessionLauncher {
  /**
   * 로그인 세션용 로컬 브라우저 프로세스를 시작한다.
   */
  async start({ loginSessionId, userId }) {
    const loginSession = await loginSessionService.getLoginSessionOrThrow({
      loginSessionId,
      userId,
    });

    if (loginSession.processId) {
      return loginSession;
    }

    const scriptPath = path.resolve(__dirname, '../../scripts/interactiveLogin.js');
    const child = spawn(process.execPath, [
      scriptPath,
      loginSession.connectionId,
      '--login-session-id',
      loginSession.id,
      '--user-id',
      userId,
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: path.resolve(__dirname, '..', '..'),
    });

    child.unref();

    return loginSessionService.attachProcess({
      loginSessionId,
      userId,
      processId: child.pid,
    });
  }
}

module.exports = new LoginSessionLauncher();
