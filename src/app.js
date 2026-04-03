require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');
const healthRoutes = require('./routes/health');
const agentRoutes = require('./routes/agent');
const connectionsRoutes = require('./routes/connections');
const jobsRoutes = require('./routes/jobs');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.use(healthRoutes);
app.use('/api', connectionsRoutes);
app.use('/api', jobsRoutes);
app.use('/api/agent', agentRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Path not found: ${req.method} ${req.originalUrl}`,
    },
  });
});

app.use(errorHandler);

module.exports = app;
