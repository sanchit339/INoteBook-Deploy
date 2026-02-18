const express = require('express');
const router = express.Router();

router.post('/client', (req, res) => {
  const { level = 'info', event = 'client_event', message = '', meta = {} } = req.body || {};
  const safeLevel = String(level).slice(0, 16);
  const safeEvent = String(event).slice(0, 64);
  const safeMessage = String(message).slice(0, 500);
  const safeMeta = typeof meta === 'object' && meta !== null ? meta : {};

  console.log('[client:event]', JSON.stringify({
    reqId: req.reqId || '',
    level: safeLevel,
    event: safeEvent,
    message: safeMessage,
    meta: safeMeta,
    path: req.originalUrl || req.url,
  }));

  return res.status(204).send();
});

module.exports = router;
