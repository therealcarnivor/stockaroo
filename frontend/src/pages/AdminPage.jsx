import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  exportBackup,
  getMqttSettings,
  getStats,
  listScans,
  restoreBackup,
  updateMqttSettings,
  zeroStock
} from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';

const emptyMqttForm = {
  enabled: false,
  url: '',
  topic: '',
  username: '',
  clientId: '',
  delta: 1,
  passwordSet: false,
  running: false,
  connected: false,
  lastMessageAt: null,
  lastError: null
};

const REFRESH_MS = 5000;
const scanTint = (scan) => (scan.source === 'mqtt' ? 'tint-mqtt' : scan.created ? 'tint-new' : 'tint-ok');

export default function AdminPage() {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [mqttForm, setMqttForm] = useState(emptyMqttForm);
  const [mqttPassword, setMqttPassword] = useState('');
  const [mqttScans, setMqttScans] = useState([]);
  const [clearMqttPassword, setClearMqttPassword] = useState(false);
  const backupRef = useRef(null);

  const refreshMqttScans = () =>
    listScans()
      .then((scans) => setMqttScans(scans.filter((scan) => scan.source === 'mqtt').slice(0, 20)))
      .catch(() => {});

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    getMqttSettings().then((settings) => setMqttForm({ ...emptyMqttForm, ...settings })).catch(() => {});
    refreshMqttScans();
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refreshMqttScans();
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const saveMqtt = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        enabled: mqttForm.enabled,
        url: mqttForm.url.trim(),
        topic: mqttForm.topic.trim(),
        username: mqttForm.username.trim(),
        clientId: mqttForm.clientId.trim(),
        delta: Number(mqttForm.delta),
        clearPassword: clearMqttPassword
      };
      if (mqttPassword) payload.password = mqttPassword;

      const result = await updateMqttSettings(payload);
      setMqttForm({ ...emptyMqttForm, ...result });
      setMqttPassword('');
      setClearMqttPassword(false);
      setStatus({ kind: 'ok', text: 'MQTT settings saved.' });
      refreshMqttScans();
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
    }
  };

  const downloadBackup = async () => {
    try {
      const data = await exportBackup();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `stockaroo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
    }
  };

  const uploadBackup = async (file) => {
    if (!confirm('Restoring replaces ALL items, stores and users, and signs everyone out. Continue?')) {
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const result = await restoreBackup(data);
      setStatus({
        kind: 'ok',
        text: `Restored ${result.items} items, ${result.stores} stores, ${result.brands} brands, ${result.categories} categories, ${result.scans} scans, ${result.users} users.`
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        text: ADMIN_ERRORS[err.message] || err.message || 'Could not read that file.'
      });
    }
  };

  const zeroAll = async () => {
    if (!confirm('Set every item\'s stock to 0? Item details and history are kept.')) return;
    try {
      const result = await zeroStock();
      setStatus({ kind: 'ok', text: `Zeroed stock on ${result.items} items.` });
      getStats().then(setStats).catch(() => {});
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
    }
  };

  return (
    <section className="stack">
      <h1>Admin</h1>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <strong>{stats.items}</strong>
            <span className="muted">Items</span>
          </div>
          <div className="stat-card">
            <strong>{stats.frozenItems}</strong>
            <span className="muted">Frozen items</span>
          </div>
          <div className="stat-card">
            <strong>{stats.neededItems}</strong>
            <span className="muted">To buy</span>
          </div>
          <div className="stat-card">
            <strong>{stats.outOfStockItems}</strong>
            <span className="muted">Out of stock</span>
          </div>
          <div className="stat-card">
            <strong>{stats.stores}</strong>
            <span className="muted">Stores</span>
          </div>
          <div className="stat-card">
            <strong>{stats.brands}</strong>
            <span className="muted">Brands</span>
          </div>
          <div className="stat-card">
            <strong>{stats.categories}</strong>
            <span className="muted">Categories</span>
          </div>
        </div>
      )}

      <div className="admin-links">
        <Link className="card admin-link" to="/admin/users">
          <strong>Users</strong>
          <span className="muted">Accounts, admin rights and password resets</span>
        </Link>
        <Link className="card admin-link" to="/admin/stores">
          <strong>Stores</strong>
          <span className="muted">Curate the store list used by items</span>
        </Link>
        <Link className="card admin-link" to="/admin/brands">
          <strong>Brands</strong>
          <span className="muted">Curate the brand list used by items</span>
        </Link>
        <Link className="card admin-link" to="/admin/categories">
          <strong>Categories</strong>
          <span className="muted">Curate the category list used by items</span>
        </Link>
      </div>

      <h2>MQTT scanner</h2>
      <form className="card" onSubmit={saveMqtt}>
        <label className="check">
          <input
            type="checkbox"
            checked={mqttForm.enabled}
            onChange={(e) => setMqttForm({ ...mqttForm, enabled: e.target.checked })}
          />
          Listen for barcode scans
        </label>
        <div className="row">
          <input
            className="input grow"
            placeholder="Broker URL, e.g. mqtt://192.168.1.10:1883"
            value={mqttForm.url}
            onChange={(e) => setMqttForm({ ...mqttForm, url: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            className="input grow"
            placeholder="Topic, e.g. stockaroo/scans"
            value={mqttForm.topic}
            onChange={(e) => setMqttForm({ ...mqttForm, topic: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <div className="row">
          <input
            className="input grow"
            placeholder="Username"
            value={mqttForm.username}
            onChange={(e) => setMqttForm({ ...mqttForm, username: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            className="input grow"
            type="password"
            placeholder={mqttForm.passwordSet ? 'Password set; leave blank to keep' : 'Password'}
            value={mqttPassword}
            onChange={(e) => setMqttPassword(e.target.value)}
            autoComplete="new-password"
            disabled={clearMqttPassword}
          />
          {mqttForm.passwordSet && (
            <label className="check">
              <input
                type="checkbox"
                checked={clearMqttPassword}
                onChange={(e) => setClearMqttPassword(e.target.checked)}
              />
              Clear password
            </label>
          )}
        </div>
        <div className="row">
          <input
            className="input grow"
            placeholder="Client ID"
            value={mqttForm.clientId}
            onChange={(e) => setMqttForm({ ...mqttForm, clientId: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            className="input min-input"
            type="number"
            min="-1000"
            max="1000"
            step="1"
            value={mqttForm.delta}
            onChange={(e) => setMqttForm({ ...mqttForm, delta: e.target.value })}
            aria-label="Scan amount"
          />
          <button className="btn primary" type="submit">Save MQTT</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Barcode</th>
                <th>Qty</th>
                <th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {mqttScans.map((scan) => (
                <tr key={scan.id} className={scanTint(scan)}>
                  <td>{scan.name}</td>
                  <td className="mono">{scan.barcode}</td>
                  <td>{scan.delta > 0 ? `+${scan.delta}` : scan.delta}</td>
                  <td>{scan.scanned_at}</td>
                </tr>
              ))}
              {mqttScans.length === 0 && (
                <tr>
                  <td colSpan="4" className="muted">
                    {mqttForm.running ? (mqttForm.connected ? 'Connected; no MQTT scans yet.' : 'Connecting; no MQTT scans yet.') : 'MQTT scanner disabled.'}
                    {mqttForm.lastError ? ` ${mqttForm.lastError}` : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>

      <h2>Backup</h2>
      <div className="card">
        <p className="muted">
          A backup contains every item, scan, store and user account, including password hashes —
          keep the file safe. Restoring replaces the entire database.
        </p>
        <div className="row">
          <button className="btn primary" onClick={downloadBackup}>Export everything</button>
          <button className="btn" onClick={() => backupRef.current?.click()}>Restore backup</button>
          <input
            ref={backupRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) uploadBackup(file);
            }}
          />
        </div>
        {status && <p className={`status ${status.kind}`}>{status.text}</p>}
      </div>

      <h2>Zero stock</h2>
      <div className="card">
        <p className="muted">
          Sets every item's quantity to 0. Item names, stores, sizes, barcodes and history are kept.
        </p>
        <div className="row">
          <button className="btn danger" onClick={zeroAll}>Zero all products</button>
        </div>
      </div>
    </section>
  );
}
