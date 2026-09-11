import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addBarcode,
  deleteItem,
  itemHistory,
  listBrands,
  listItems,
  listStores,
  mergeItem,
  removeBarcode,
  scan,
  updateItem
} from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';
import BrandSelect from '../components/BrandSelect.jsx';
import StoreSelect from '../components/StoreSelect.jsx';

// Ranks candidates by shared name words so the likely duplicate is preselected.
const nameTokens = (name) => new Set(name.toLowerCase().trim().split(/\s+/).filter(Boolean));
const closestItem = (name, candidates) => {
  const target = nameTokens(name);
  let best = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const tokens = nameTokens(candidate.name);
    const shared = [...target].filter((t) => tokens.has(t)).length;
    const score = shared / Math.max(target.size, tokens.size, 1);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
};

export default function ItemPage({ isAdmin }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', store: '', brand: '', size: '' });
  const [stores, setStores] = useState([]);
  const [brands, setBrands] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [newBarcode, setNewBarcode] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState([]);
  const [mergeTarget, setMergeTarget] = useState('');

  const refresh = useCallback(
    () => itemHistory(id).then(setData).catch((err) => setError(err.message)),
    [id]
  );

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => { listStores().then(setStores).catch(() => {}); }, []);

  useEffect(() => { listBrands().then(setBrands).catch(() => {}); }, []);

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
      brand: draft.brand.trim(),
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

  const openMerge = async () => {
    setMerging((v) => !v);
    if (merging || mergeCandidates.length > 0) return;
    try {
      const others = (await listItems('')).filter((i) => i.id !== item.id);
      setMergeCandidates(others);
      setMergeTarget(String(closestItem(item.name, others)?.id ?? ''));
    } catch {
      setStatus({ kind: 'error', text: 'Could not load other items.' });
    }
  };

  const doMerge = async () => {
    const target = mergeCandidates.find((i) => String(i.id) === mergeTarget);
    if (!target) return;
    if (!confirm(`Merge "${item.name}" into "${target.name}"? This item will be deleted.`)) return;
    try {
      await mergeItem(item.id, target.id);
      navigate(`/items/${target.id}`);
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.body?.error] || err.message });
    }
  };

  const handleAddBarcode = async () => {
    const barcode = newBarcode.trim();
    if (!barcode) return;
    try {
      await addBarcode(item.id, barcode);
      setNewBarcode('');
      refresh();
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.body?.error] || err.message });
    }
  };

  const handleRemoveBarcode = async (barcode) => {
    if (!confirm(`Remove barcode ${barcode} from this item?`)) return;
    try {
      await removeBarcode(item.id, barcode);
      refresh();
    } catch (err) {
      setStatus({ kind: 'error', text: ADMIN_ERRORS[err.body?.error] || err.message });
    }
  };

  return (
    <section className="stack">
      <div className="row spread">
        <button className="btn small" onClick={() => navigate(-1)}>← Back</button>
        <div className="row">
          <button className="btn small" onClick={openMerge}>Merge</button>
          {isAdmin && (
            <button className="btn small danger" onClick={remove}>Delete item</button>
          )}
        </div>
      </div>

      {merging && (
        <div className="card">
          <div className="row">
            <select
              className="input grow"
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              aria-label="Merge into"
            >
              <option value="">Select an item…</option>
              {mergeCandidates.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {[i.store, i.size].filter(Boolean).length
                    ? ` — ${[i.store, i.size].filter(Boolean).join(' · ')}`
                    : ''}
                </option>
              ))}
            </select>
            <button className="btn small primary" onClick={doMerge} disabled={!mergeTarget}>
              Merge into this
            </button>
          </div>
        </div>
      )}

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}

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
              <BrandSelect
                className="input grow"
                brands={brands}
                value={draft.brand}
                onChange={(brand) => setDraft({ ...draft, brand })}
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
                setDraft({
                  name: item.name,
                  store: item.store || '',
                  brand: item.brand || '',
                  size: item.size || ''
                });
              }}
            >
              Edit
            </button>
          </div>
        )}

        <dl className="details">
          <dt>Storage</dt>
          <dd>
            <label className="check">
              <input
                type="checkbox"
                checked={!!item.frozen}
                onChange={async (e) => {
                  await updateItem(item.id, { frozen: e.target.checked });
                  refresh();
                }}
              />
              Frozen
            </label>
          </dd>
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
          <dt>Brand</dt>
          <dd>{item.brand || <span className="muted">Not set</span>}</dd>
          <dt>Size</dt>
          <dd>{item.size || <span className="muted">Not set</span>}</dd>
          <dt>Barcode</dt>
          <dd>
            <ul className="list barcode-list">
              {(item.barcodes || [item.barcode]).map((code) => (
                <li key={code} className="barcode-row">
                  <span className="mono">{code}</span>
                  <button
                    className="barcode-remove"
                    onClick={() => handleRemoveBarcode(code)}
                    disabled={(item.barcodes || []).length <= 1}
                    aria-label={`Remove barcode ${code}`}
                    title="Remove barcode"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="row">
              <input
                className="input grow"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="Add another barcode"
              />
              <button className="btn small" onClick={handleAddBarcode} disabled={!newBarcode.trim()}>
                Add
              </button>
            </div>
          </dd>
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
