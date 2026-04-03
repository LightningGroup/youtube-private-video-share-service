const config = require('../config');

class ServerClient {
  buildHeaders(extraHeaders = {}) {
    return {
      authorization: `Bearer ${config.adminToken}`,
      'x-agent-id': config.agentId,
      'content-type': 'application/json',
      ...extraHeaders,
    };
  }

  async request({ method, pathname, body }) {
    const response = await fetch(`${config.serverBaseUrl}${pathname}`, {
      method,
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (response.ok) {
      return payload;
    }

    const error = new Error(payload?.error?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    throw error;
  }

  async claimNextJob() {
    return this.request({
      method: 'POST',
      pathname: '/api/agent/jobs/claim',
    });
  }

  async completeLoginSession({ loginSessionId }) {
    return this.request({
      method: 'POST',
      pathname: `/api/agent/login-sessions/${loginSessionId}/complete`,
    });
  }

  async failLoginSession({ loginSessionId }) {
    return this.request({
      method: 'POST',
      pathname: `/api/agent/login-sessions/${loginSessionId}/fail`,
    });
  }

  async completeJob({ jobId, summary, results }) {
    return this.request({
      method: 'POST',
      pathname: `/api/agent/jobs/${jobId}/complete`,
      body: {
        summary,
        results,
      },
    });
  }

  async failJob({ jobId, errorCode, message, needsReauth }) {
    return this.request({
      method: 'POST',
      pathname: `/api/agent/jobs/${jobId}/fail`,
      body: {
        errorCode,
        message,
        needsReauth,
      },
    });
  }
}

module.exports = new ServerClient();
