import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportBackup, restoreBackup } from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';

export default function AdminPage() {
  const [status, setStatus] = useState(null);
  const backupRef = useRef(null);

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
        text: `Restored ${result.items} items, ${result.stores} stores, ${result.scans} scans, ${result.users} users.`
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        text: ADMIN_ERRORS[err.message] || err.message || 'Could not read that file.'
      });
    }
  };

  return (
    <section className="stack">
      <h1>Admin</h1>

      <div className="admin-links">
        <Link className="card admin-link" to="/admin/users">
          <strong>Users</strong>
          <span className="muted">Accounts, admin rights and password resets</span>
        </Link>
        <Link className="card admin-link" to="/admin/stores">
          <strong>Stores</strong>
          <span className="muted">Curate the store list used by items</span>
        </Link>
      </div>

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
    </section>
  );
}
