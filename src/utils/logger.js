function createJobLogger(job) {
  return {
    info(message) {
      job.addLog('info', message);
    },
    warn(message) {
      job.addLog('warn', message);
    },
    error(message) {
      job.addLog('error', message);
    },
  };
}

module.exports = {
  createJobLogger,
};
