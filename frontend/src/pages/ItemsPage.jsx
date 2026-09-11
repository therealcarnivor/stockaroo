import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listItems, scan } from '../api.js';
import BarcodeIcon from '../components/BarcodeIcon.jsx';
import FrozenIcon from '../components/FrozenIcon.jsx';

const REFRESH_MS = 5000;

export default function ItemsPage({ online }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [neededOnly, setNeededOnly] = useState(false);
  const [frozen, setFrozen] = useState(null); // null = all, true = frozen, false = ambient
  const [status, setStatus] = useState(null);
  const [revealed, setRevealed] = useState(() => new Set());

  const refresh = useCallback(
    () => listItems(q, neededOnly, frozen).then(setItems).catch(() => {}),
    [q, neededOnly, frozen]
  );

  useEffect(() => {
    const t = setTimeout(refresh, 200);
    return () => clearTimeout(t);
  }, [refresh]);

  // Poll while the tab is visible so other devices' scans show up without a reload.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh();
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  // Goes through the scan endpoint so manual adjustments still appear in history.
  const adjust = async (item, delta) => {
    await scan({ barcode: item.barcode, delta }).catch(() => {});
    refresh();
  };

  const toggleBarcode = (id) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doExport = async () => {
    try {
      const needed = await listItems('', true);
      if (needed.length === 0) {
        setStatus({ kind: 'info', text: 'Nothing on the shopping list.' });
        return;
      }

      const byStore = new Map();
      for (const item of needed) {
        const key = item.store || 'Any store';
        if (!byStore.has(key)) byStore.set(key, { frozen: [], ambient: [] });
        byStore.get(key)[item.frozen ? 'frozen' : 'ambient'].push(item);
      }

      const lines = [`Stockaroo shopping list — ${new Date().toLocaleString()}`, ''];
      for (const store of [...byStore.keys()].sort()) {
        lines.push(store, '='.repeat(store.length));
        for (const [group, heading] of [['ambient', 'Ambient'], ['frozen', 'Frozen']]) {
          const list = byStore.get(store)[group];
          if (list.length === 0) continue;
          lines.push(`  ${heading}`);
          for (const item of list.sort((a, b) => a.name.localeCompare(b.name))) {
            const size = item.size ? ` (${item.size})` : '';
            lines.push(`    [ ] ${item.name}${size} — have ${item.quantity}, min ${item.min_stock}`);
          }
          lines.push('');
        }
      }
      lines.push(`${needed.length} item${needed.length > 1 ? 's' : ''} to buy.`);

      const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopping-list-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({ kind: 'error', text: err.message });
    }
  };

  return (
    <section className="stack">
      <div className="row spread">
        <h1>Items</h1>
        <button className="btn small" onClick={doExport} disabled={!online}>
          Export to-buy list
        </button>
      </div>

      <div className="row">
        <span className="search-box grow">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, store, size or barcode"
          />
          {q && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQ('')}
              aria-label="Clear search"
              title="Clear search"
            >
              ×
            </button>
          )}
        </span>
        <button
          className={`btn ${neededOnly ? 'primary' : ''}`}
          onClick={() => setNeededOnly((v) => !v)}
        >
          {neededOnly ? 'Showing to buy' : 'To buy only'}
        </button>
        <select
          className="input auto"
          value={frozen === null ? 'all' : frozen ? 'frozen' : 'ambient'}
          onChange={(e) =>
            setFrozen(e.target.value === 'all' ? null : e.target.value === 'frozen')
          }
          aria-label="Filter by storage"
        >
          <option value="all">All goods</option>
          <option value="frozen">Frozen only</option>
          <option value="ambient">Non-frozen only</option>
        </select>
      </div>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="center">Code</th>
              <th>Name</th>
              <th className="center">In stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`row-link${item.needed ? ' needed' : item.quantity === 0 ? ' out-of-stock' : ''}`}
                onClick={() => navigate(`/items/${item.id}`)}
              >
                <td data-label="Code" onClick={(e) => e.stopPropagation()}>
                  <span className="icon-cell">
                    <button
                      className="icon-toggle"
                      onClick={() => item.barcode && toggleBarcode(item.id)}
                      disabled={!item.barcode}
                      aria-expanded={revealed.has(item.id)}
                      aria-label={item.barcode ? `Show barcode for ${item.name}` : 'No barcode'}
                      title={item.barcode ? 'Show barcode' : 'No barcode'}
                    >
                      <BarcodeIcon missing={!item.barcode} />
                    </button>
                    {!!item.frozen && <FrozenIcon />}
                  </span>
                </td>
                <td data-label="Name">
                  {item.name}
                  {(item.store || item.size) && (
                    <span className="meta">{[item.store, item.size].filter(Boolean).join(' · ')}</span>
                  )}
                  {revealed.has(item.id) && (
                    <span className="mono barcode-reveal">{item.barcode}</span>
                  )}
                </td>
                <td data-label="In stock" onClick={(e) => e.stopPropagation()}>
                  <span className="stepper">
                    <button
                      className="btn small"
                      onClick={() => adjust(item, -1)}
                      disabled={item.quantity === 0}
                      aria-label={`Decrease ${item.name}`}
                    >
                      −
                    </button>
                    <span className="qty">{item.quantity}</span>
                    <button
                      className="btn small"
                      onClick={() => adjust(item, 1)}
                      aria-label={`Increase ${item.name}`}
                    >
                      +
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="muted" colSpan={3}>No items.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
