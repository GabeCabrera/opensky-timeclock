const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { runMigrations } = require('./migrate');
const { requestLogger, logger } = require('./utils/logger');

const authRoutes = require('./routes/auth');
const timeRoutes = require('./routes/time');
const adminRoutes = require('./routes/admin');
const { mailerStatus } = require('./utils/mailer');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://your-frontend-domain.com' 
    : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(requestLogger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/time', timeRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'OpenSky Time Clock API is running', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('global error handler', { requestId: req.requestId, error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Something went wrong!', code: 'UNHANDLED' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Run migrations then start server
runMigrations().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server started`, { port: PORT });
    logger.info(`Health endpoint ready`, { url: `http://localhost:${PORT}/api/health` });
    const ms = mailerStatus();
    logger.info('Mailer status', ms);
  });
}).catch(err => {
  logger.error('Failed to run migrations, server not started', { error: err.message, stack: err.stack });
  process.exit(1);
});