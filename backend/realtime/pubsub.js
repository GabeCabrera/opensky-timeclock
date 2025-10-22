// Simple in-memory pubsub for user time status events (SSE based)

const userStreams = new Map(); // userId -> Set<res>
const adminStreams = new Set(); // Set<res> for admin-wide events

function addStream(userId, res) {
  if (!userStreams.has(userId)) userStreams.set(userId, new Set());
  userStreams.get(userId).add(res);
}

function removeStream(userId, res) {
  const set = userStreams.get(userId);
  if (set) {
    set.delete(res);
    if (set.size === 0) userStreams.delete(userId);
  }
}

function broadcastToUser(userId, event, data) {
  const set = userStreams.get(userId);
  if (!set) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const res of set) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (_) {
      // Ignore broken pipe; cleanup will occur on close
    }
  }
}

function addAdminStream(res) {
  adminStreams.add(res);
}

function removeAdminStream(res) {
  adminStreams.delete(res);
}

function broadcastToAdmins(event, data) {
  if (adminStreams.size === 0) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const res of adminStreams) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (_) {}
  }
}

function heartbeat() {
  for (const [userId, set] of userStreams.entries()) {
    for (const res of set) {
      try {
        res.write('event: heartbeat\n');
        res.write('data: {}\n\n');
      } catch (_) {}
    }
  }
  for (const res of adminStreams) {
    try {
      res.write('event: heartbeat\n');
      res.write('data: {}\n\n');
    } catch (_) {}
  }
}

// Periodic heartbeat every 25s to keep connections alive behind proxies
setInterval(heartbeat, 25000).unref();

module.exports = { addStream, removeStream, broadcastToUser, addAdminStream, removeAdminStream, broadcastToAdmins };
