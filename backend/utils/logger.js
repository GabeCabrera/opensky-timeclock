// Simple structured logger with request correlation and timing
// In production you might swap this with pino/winston, but this keeps dependencies minimal.
const { randomUUID } = require('crypto');

const isDev = process.env.NODE_ENV !== 'production';
const LEVELS = ['error', 'warn', 'info', 'debug'];
const envLevel = (process.env.LOG_LEVEL || (isDev ? 'info' : 'warn')).toLowerCase();
const activeLevelIndex = LEVELS.indexOf(envLevel) === -1 ? LEVELS.indexOf('info') : LEVELS.indexOf(envLevel);

function ts() {
  return new Date().toISOString();
}

function base(meta = {}) {
  return { time: ts(), ...meta };
}

function log(level, message, meta) {
  const levelIndex = LEVELS.indexOf(level);
  if (levelIndex > activeLevelIndex) return; // suppressed
  const payload = base({ level, msg: message, ...meta });
  if (level === 'error') {
    console.error(JSON.stringify(payload));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

module.exports.logger = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => { if (isDev) log('debug', msg, meta); },
  level: envLevel,
};

// Express middleware to add request id and timing
module.exports.requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  const requestId = randomUUID();
  req.requestId = requestId;
  const { method, originalUrl } = req;
  log('info', 'incoming request', { requestId, method, url: originalUrl, ip: req.ip });

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round(durationNs / 1e6);
  log('info', 'request completed', { requestId, method, url: originalUrl, status: res.statusCode, durationMs });
  });

  next();
};

// Helper to wrap async route handlers
module.exports.withRouteLogging = (name, handler) => async (req, res, next) => {
  const meta = { requestId: req.requestId, route: name };
  try {
    await handler(req, res, next);
  } catch (err) {
    log('error', 'unhandled route error', { ...meta, error: err.message, stack: err.stack });
    next(err);
  }
};
