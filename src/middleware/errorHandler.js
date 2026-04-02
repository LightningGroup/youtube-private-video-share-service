function errorHandler(error, _req, res, _next) {
  const status = error.status || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'Unexpected server error';

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

module.exports = errorHandler;
