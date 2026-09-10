import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createStore, deleteStore, listStores, updateStore } from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';

export default function AdminStoresPage() {
  const [stores, setStores] = useState([]);
  const [storeName, setStoreName] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(null);

  const refresh = useCallback(() => listStores().then(setStores).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn, okText) => {
    try {
      await fn();
      setStatus({ kind: 'ok', text: okText });
      refresh();
      return true;
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
      return false;
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const ok = await run(() => createStore(storeName.trim()), 'Store added.');
    if (ok) setStoreName('');
  };

  const save = async (store) => {
    const ok = await run(() => updateStore(store.id, draft.trim()), 'Store renamed.');
    if (ok) setEditing(null);
  };

  const remove = async (store) => {
    try {
      await deleteStore(store.id);
      setStatus({ kind: 'ok', text: 'Store deleted.' });
      refresh();
    } catch (err) {
      if (err.body?.error === 'store_in_use') {
        if (!confirm(`${err.body.items} item(s) use "${store.name}". Delete anyway and clear them?`)) {
          return;
        }
        await run(() => deleteStore(store.id, true), 'Store deleted.');
      } else {
        setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
      }
    }
  };

  return (
    <section className="stack">
      <div className="row spread">
        <h1>Stores</h1>
        <Link className="btn small" to="/admin">← Admin</Link>
      </div>

      <form className="card" onSubmit={add}>
        <div className="row">
          <input
            className="input grow"
            placeholder="Store name, e.g. Tesco"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={!storeName.trim()}>Add store</button>
        </div>
      </form>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}

      <ul className="list">
        {stores.map((store) => (
          <li key={store.id} className="store-row">
            {editing === store.id ? (
              <>
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                />
                <span className="row">
                  <button className="btn small primary" onClick={() => save(store)}>Save</button>
                  <button className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                </span>
              </>
            ) : (
              <>
                <span>{store.name}</span>
                <span className="row">
                  <button
                    className="btn small"
                    onClick={() => { setEditing(store.id); setDraft(store.name); }}
                  >
                    Rename
                  </button>
                  <button className="btn small danger" onClick={() => remove(store)}>Delete</button>
                </span>
              </>
            )}
          </li>
        ))}
        {stores.length === 0 && <li className="muted">No stores yet.</li>}
      </ul>
    </section>
  );
}
