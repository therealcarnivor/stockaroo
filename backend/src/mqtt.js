const mqtt = require('mqtt');
const { scanBarcode } = require('./scanService');
const { getMqttSettings, publicMqttSettings } = require('./settingsService');

let client = null;
let status = {
  running: false,
  connected: false,
  lastMessageAt: null,
  lastError: null
};

const parsePayload = (message, defaultDelta) => {
  const text = message.toString('utf8').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return {
        barcode: String(parsed.barcode ?? parsed.code ?? '').trim(),
        delta: Number.isInteger(parsed.delta) ? parsed.delta : defaultDelta,
        source: 'mqtt'
      };
    }
  } catch {
    // Plain barcode payloads are supported too.
  }

  return { barcode: text, delta: defaultDelta, source: 'mqtt' };
};

const stopMqttListener = () => {
  if (client) {
    client.end(true);
    client = null;
  }
  status = { ...status, running: false, connected: false };
};

const startMqttListener = (settings = getMqttSettings()) => {
  stopMqttListener();

  if (!settings.enabled) return getMqttStatus(settings);
  if (!settings.url || !settings.topic) {
    status = { ...status, running: false, connected: false, lastError: 'mqtt_missing_config' };
    return getMqttStatus(settings);
  }

  status = { running: true, connected: false, lastMessageAt: null, lastError: null };
  try {
    client = mqtt.connect(settings.url, {
      clientId: settings.clientId || undefined,
      username: settings.username || undefined,
      password: settings.password || undefined,
      reconnectPeriod: 5000
    });
  } catch (err) {
    status = { ...status, running: false, lastError: err.message };
    return getMqttStatus(settings);
  }

  client.on('connect', () => {
    status = { ...status, connected: true, lastError: null };
    client.subscribe(settings.topic, (err) => {
      if (err) status = { ...status, lastError: err.message };
    });
  });

  client.on('reconnect', () => {
    status = { ...status, connected: false };
  });

  client.on('close', () => {
    status = { ...status, connected: false };
  });

  client.on('error', (err) => {
    status = { ...status, lastError: err.message };
  });

  client.on('message', (topic, message) => {
    const payload = parsePayload(message, settings.delta);
    if (!payload) return;

    const result = scanBarcode(payload);
    status = {
      ...status,
      lastMessageAt: new Date().toISOString(),
      lastError: result.error || null
    };
  });

  return getMqttStatus(settings);
};

const restartMqttListener = () => startMqttListener(getMqttSettings());

const getMqttStatus = (settings = getMqttSettings()) => ({
  ...publicMqttSettings(settings),
  running: status.running,
  connected: status.connected,
  lastMessageAt: status.lastMessageAt,
  lastError: status.lastError
});

module.exports = { getMqttStatus, restartMqttListener, startMqttListener, stopMqttListener };
