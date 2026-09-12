const express = require('express');
const { getMqttSettings, publicMqttSettings, updateMqttSettings } = require('../settingsService');
const { getMqttStatus, restartMqttListener } = require('../mqtt');
const { requireAdmin } = require('../session');

const router = express.Router();

router.get('/mqtt', requireAdmin, (req, res) => {
  res.json({ ...publicMqttSettings(getMqttSettings()), ...getMqttStatus() });
});

router.put('/mqtt', requireAdmin, (req, res) => {
  const result = updateMqttSettings(req.body ?? {});
  if (result.error) return res.status(400).json({ error: result.error });

  const status = restartMqttListener();
  res.json(status);
});

router.post('/mqtt/direction', (req, res) => {
  const delta = req.body?.direction === -1 ? -1 : 1;
  const result = updateMqttSettings({ delta });
  if (result.error) return res.status(400).json({ error: result.error });

  res.json(restartMqttListener());
});

module.exports = router;
