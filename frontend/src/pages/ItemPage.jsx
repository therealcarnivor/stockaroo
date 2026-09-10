import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteItem, itemHistory, listStores, scan, updateItem } from '../api.js';
import StoreSelect from '../components/StoreSelect.jsx';

export default function ItemPage({ isAdmin }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', store: '', size: '' });
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(
    () => itemHistory(id).then(setData).catch((err) => setError(err.message)),
    [id]
  );

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => { listStores().then(setStores).catch(() => {}); }, []);

  if (error) return <p className="status error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { item, scans, totals } = data;

  const adjust = async (delta) => {
    await scan({ barcode: item.barcode, delta }).catch(() => {});
    refresh();
  };

  const saveName = async () => {
    await updateItem(item.id, {
      name: draft.name.trim(),
      store: draft.store.trim(),
      size: draft.size.trim()
    });
    setEditing(false);
    refresh();
  };

  const remove = async () => {
    if (!confirm(`Are you sure? "${item.name}" and its history will be deleted permanently.`)) return;
    await deleteItem(item.id);
    navigate('/items');
  };

  return (
    <section className="stack">
      <div className="row spread">
        <button className="btn small" onClick={() => navigate(-1)}>← Back</button>
        {isAdmin && (
          <button className="btn small danger" onClick={remove}>Delete item</button>
        )}
      </div>

      <div className="card">
        {editing ? (
          <>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
              autoFocus
            />
            <div className="row">
              <StoreSelect
                className="input grow"
                stores={stores}
                value={draft.store}
                onChange={(store) => setDraft({ ...draft, store })}
              />
              <input
                className="input grow"
                value={draft.size}
                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                placeholder="Size"
              />
            </div>
            <div className="row">
              <button className="btn small primary" onClick={saveName}>Save</button>
              <button className="btn small" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="row spread">
            <h1>{item.name}</h1>
            <button
              className="btn small"
              onClick={() => {
                setEditing(true);
                setDraft({ name: item.name, store: item.store || '', size: item.size || '' });
              }}
            >
              Edit
            </button>
          </div>
        )}

        <dl className="details">
          <dt>Minimum stock</dt>
          <dd>
            <input
              className="input min-input"
              type="number"
              min="0"
              value={item.min_stock ?? 0}
              onChange={async (e) => {
                const min = Number(e.target.value);
                if (!Number.isInteger(min) || min < 0) return;
                await updateItem(item.id, { min_stock: min });
                refresh();
              }}
            />
            <span className="meta">
              {item.needed
                ? 'On the shopping list'
                : item.min_stock > 0
                  ? 'Above the minimum'
                  : 'Not tracked (0 = off)'}
            </span>
          </dd>
          <dt>Store</dt>
          <dd>{item.store || <span className="muted">Not set</span>}</dd>
          <dt>Size</dt>
          <dd>{item.size || <span className="muted">Not set</span>}</dd>
          <dt>Barcode</dt>
          <dd className="mono">{item.barcode}</dd>
          <dt>In stock</dt>
          <dd>
            <span className="stepper">
              <button className="btn small" onClick={() => adjust(-1)} disabled={item.quantity === 0}>
                −
              </button>
              <span className="qty">{item.quantity}</span>
              <button className="btn small" onClick={() => adjust(1)}>+</button>
            </span>
          </dd>
          <dt>Total stocked in</dt>
          <dd>{totals.added}</dd>
          <dt>Total used up</dt>
          <dd>{totals.removed}</dd>
          <dt>First seen</dt>
          <dd className="muted">{item.created_at}</dd>
          <dt>Last activity</dt>
          <dd className="muted">{item.updated_at}</dd>
        </dl>
      </div>

      <h2>History ({totals.events})</h2>
      <ul className="list">
        {scans.map((s) => (
          <li key={s.id} className="history-row">
            <span className={s.delta > 0 ? 'delta in' : 'delta out'}>
              {s.delta > 0 ? `+${s.delta}` : s.delta}
            </span>
            <span>{s.delta > 0 ? 'Stocked in' : 'Used up'}</span>
            <span className="muted">{s.scanned_at}</span>
          </li>
        ))}
        {scans.length === 0 && <li className="muted">No history yet.</li>}
      </ul>
    </section>
  );
}
