const { db } = require('./db');

const MQTT_DEFAULTS = {
  enabled: false,
  url: '',
  topic: '',
  username: '',
  password: '',
  clientId: '',
  delta: 1
};

const BOOL_KEYS = new Set(['mqtt.enabled']);
const INT_KEYS = new Set(['mqtt.delta']);

const getSetting = (key, fallback = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
};

const setSetting = (key, value) => {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, String(value));
};

const readTypedSetting = (key, fallback) => {
  const value = getSetting(key, fallback);
  if (BOOL_KEYS.has(key)) return value === '1';
  if (INT_KEYS.has(key)) {
    const number = Number(value);
    return Number.isInteger(number) ? number : fallback;
  }
  return value;
};

const getMqttSettings = () => ({
  enabled: readTypedSetting('mqtt.enabled', MQTT_DEFAULTS.enabled),
  url: readTypedSetting('mqtt.url', MQTT_DEFAULTS.url),
  topic: readTypedSetting('mqtt.topic', MQTT_DEFAULTS.topic),
  username: readTypedSetting('mqtt.username', MQTT_DEFAULTS.username),
  password: readTypedSetting('mqtt.password', MQTT_DEFAULTS.password),
  clientId: readTypedSetting('mqtt.clientId', MQTT_DEFAULTS.clientId),
  delta: readTypedSetting('mqtt.delta', MQTT_DEFAULTS.delta)
});

const publicMqttSettings = (settings = getMqttSettings()) => ({
  enabled: settings.enabled,
  url: settings.url,
  topic: settings.topic,
  username: settings.username,
  clientId: settings.clientId,
  delta: settings.delta,
  passwordSet: settings.password.length > 0
});

const updateMqttSettings = (patch) => {
  const current = getMqttSettings();
  const next = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    url: typeof patch.url === 'string' ? patch.url.trim().slice(0, 300) : current.url,
    topic: typeof patch.topic === 'string' ? patch.topic.trim().slice(0, 200) : current.topic,
    username: typeof patch.username === 'string' ? patch.username.trim().slice(0, 120) : current.username,
    password: patch.clearPassword ? '' : typeof patch.password === 'string' ? patch.password : current.password,
    clientId: typeof patch.clientId === 'string' ? patch.clientId.trim().slice(0, 120) : current.clientId,
    delta: Number.isInteger(patch.delta) ? patch.delta : current.delta
  };

  if (Math.abs(next.delta) > 1000 || next.delta === 0) {
    return { error: 'invalid_delta' };
  }
  if (next.enabled && (!next.url || !next.topic)) {
    return { error: 'mqtt_missing_config' };
  }

  db.transaction(() => {
    setSetting('mqtt.enabled', next.enabled ? '1' : '0');
    setSetting('mqtt.url', next.url);
    setSetting('mqtt.topic', next.topic);
    setSetting('mqtt.username', next.username);
    setSetting('mqtt.password', next.password);
    setSetting('mqtt.clientId', next.clientId);
    setSetting('mqtt.delta', next.delta);
  })();

  return { settings: next };
};

module.exports = { getMqttSettings, publicMqttSettings, updateMqttSettings };
