import { useCallback, useEffect, useRef, useState } from 'react';
import { listBrands, listCategories, listScans, listStores, scan, setMqttDirection } from '../api.js';
import { enqueue, flush, queueSize } from '../offline.js';
import BarcodeIcon from '../components/BarcodeIcon.jsx';
import FrozenIcon from '../components/FrozenIcon.jsx';
import BrandSelect from '../components/BrandSelect.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import StoreSelect from '../components/StoreSelect.jsx';

const TINT_MS = 1400;
const REFRESH_MS = 5000;
const scanTint = (scan) => (scan.source === 'mqtt' ? 'tint-mqtt' : scan.created ? 'tint-new' : 'tint-ok');

export default function ScanPage({ online }) {
  const [barcode, setBarcode] = useState('');
  const [direction, setDirection] = useState(1); // 1 = stocking in, -1 = using up
  const [pending, setPending] = useState(null); // barcode awaiting a name
  const [details, setDetails] = useState({ name: '', store: '', brand: '', category: '', size: '', frozen: false });
  const [status, setStatus] = useState(null);
  const [recent, setRecent] = useState([]);
  const [stores, setStores] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [queued, setQueued] = useState(queueSize());
  const [revealed, setRevealed] = useState(() => new Set());
  const [tint, setTint] = useState(null); // 'ok' = known barcode, 'new' = just created
  const [keyboard, setKeyboard] = useState(false);
  const barcodeRef = useRef(null);
  const nameRef = useRef(null);
  const tintTimer = useRef(null);
  const VISIBLE_SCANS = 20;

  const refresh = useCallback(() => listScans().then(setRecent).catch(() => {}), []);

  const drain = useCallback(async () => {
    const { sent } = await flush(scan);
    setQueued(queueSize());
    if (sent) {
      setStatus({ kind: 'ok', text: `Synced ${sent} queued scan${sent > 1 ? 's' : ''}` });
      refresh();
    }
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh();
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  useEffect(() => { listStores().then(setStores).catch(() => {}); }, []);
  useEffect(() => { listBrands().then(setBrands).catch(() => {}); }, []);
  useEffect(() => { listCategories().then(setCategories).catch(() => {}); }, []);

  useEffect(() => {
    if (online) drain();
  }, [online, drain]);

  // Keep focus on the barcode box so HID scanner "keystrokes" always land here.
  useEffect(() => {
    if (!pending) barcodeRef.current?.focus();
    else nameRef.current?.focus();
  }, [pending]);

  useEffect(() => () => window.clearTimeout(tintTimer.current), []);

  const flashTint = (kind) => {
    window.clearTimeout(tintTimer.current);
    setTint(kind);
    tintTimer.current = window.setTimeout(() => setTint(null), TINT_MS);
  };

  const submitScan = async (code, newItem) => {
    const payload = { barcode: code, ...newItem, delta: direction, source: 'hand' };
    setBarcode('');

    try {
      const item = await scan(payload);
      setStatus({ kind: 'ok', text: `${item.name} — qty ${item.quantity}` });
      setPending(null);
      setDetails({ name: '', store: '', brand: '', category: '', size: '', frozen: false });
      // newItem is only passed once the name form completes a brand-new barcode.
      flashTint(newItem ? 'new' : 'ok');
      refresh();
    } catch (err) {
      if (err.offline) {
        setQueued(enqueue(payload));
        setStatus({ kind: 'info', text: `Offline — ${code} queued` });
        setPending(null);
        setDetails({ name: '', store: '', brand: '', category: '', size: '', frozen: false });
      } else if (err.status === 404 && err.body?.error === 'unknown_barcode') {
        setPending(code);
        setStatus({ kind: 'info', text: `New barcode ${code} — add its details` });
      } else {
        setStatus({ kind: 'error', text: err.message });
      }
    }
  };

  const onBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcode.trim();
    if (code) submitScan(code, null);
  };

  const chooseDirection = (nextDirection) => {
    setDirection(nextDirection);
    setMqttDirection(nextDirection).catch(() => {});
  };

  const onNameSubmit = (e) => {
    e.preventDefault();
    if (details.name.trim()) {
      submitScan(pending, {
        name: details.name.trim(),
        store: details.store.trim(),
        brand: details.brand.trim(),
        category: details.category.trim(),
        size: details.size.trim(),
        frozen: details.frozen
      });
    }
  };

  const toggleBarcode = (id) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <section className="stack">
      <div className="row spread">
        <h1>Scan</h1>
        <div className="row">
          <button
            className={`btn small ${direction === 1 ? 'primary' : ''}`}
            onClick={() => chooseDirection(1)}
          >
            Stock in
          </button>
          <button
            className={`btn small ${direction === -1 ? 'primary' : ''}`}
            onClick={() => chooseDirection(-1)}
          >
            Use up
          </button>
        </div>
      </div>

      {!pending ? (
        <form className={`card${tint ? ` tint-${tint}` : ''}`} onSubmit={onBarcodeSubmit}>
          <label htmlFor="barcode">Barcode ({direction === 1 ? 'adding' : 'removing'})</label>
          <div className="row">
            <input
              id="barcode"
              ref={barcodeRef}
              className="input big grow"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onBlur={() => !keyboard && setTimeout(() => barcodeRef.current?.focus(), 0)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              inputMode={keyboard ? 'text' : 'none'}
              placeholder="Scan or type a barcode"
            />
            <button
              className={`btn ${keyboard ? 'primary' : ''}`}
              type="button"
              onClick={() => {
                setKeyboard((v) => !v);
                setTimeout(() => barcodeRef.current?.focus(), 0);
              }}
            >
              Keyboard
            </button>
          </div>
          <button className="btn primary" type="submit">Record</button>
        </form>
      ) : (
        <form className="card" onSubmit={onNameSubmit}>
          <label htmlFor="name">New item for {pending}</label>
          <input
            id="name"
            ref={nameRef}
            className="input big"
            value={details.name}
            onChange={(e) => setDetails({ ...details, name: e.target.value })}
            placeholder="Product name, e.g. Sour Cream &amp; Chive Dip"
          />
          <div className="row">
            <StoreSelect
              className="input grow"
              stores={stores}
              value={details.store}
              onChange={(store) => setDetails({ ...details, store })}
            />
            <BrandSelect
              className="input grow"
              brands={brands}
              value={details.brand}
              onChange={(brand) => setDetails({ ...details, brand })}
            />
            <CategorySelect
              className="input grow"
              categories={categories}
              value={details.category}
              onChange={(category) => setDetails({ ...details, category })}
            />
            <input
              className="input grow"
              value={details.size}
              onChange={(e) => setDetails({ ...details, size: e.target.value })}
              placeholder="Size, e.g. 200g"
            />
            <label className="check">
              <input
                type="checkbox"
                checked={details.frozen}
                onChange={(e) => setDetails({ ...details, frozen: e.target.checked })}
              />
              Frozen
            </label>
          </div>
          <div className="row">
            <button className="btn primary" type="submit">Save</button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setPending(null);
                setDetails({ name: '', store: '', brand: '', category: '', size: '', frozen: false });
                setStatus(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
      {queued > 0 && (
        <p className="status info">
          {queued} scan{queued > 1 ? 's' : ''} waiting to sync{' '}
          <button className="btn small" onClick={drain} disabled={!online}>
            Sync now
          </button>
        </p>
      )}

      <h2>Recent scans</h2>
      <div className="scroll-panel">
        <ul className="list">
          {recent.slice(0, VISIBLE_SCANS).map((s) => (
            <li key={s.id} className={scanTint(s)}>
              <span className="icon-cell">
                <button
                  className="icon-toggle"
                  onClick={() => toggleBarcode(s.id)}
                  aria-expanded={revealed.has(s.id)}
                  aria-label={`Show barcode for ${s.name}`}
                  title="Show barcode"
                >
                  <BarcodeIcon missing={!s.barcode} />
                </button>
                {!!s.frozen && <FrozenIcon />}
              </span>
              <span>
                {s.name}
                {(s.category || s.store || s.size) && (
                  <span className="meta">{[s.category, s.store, s.size].filter(Boolean).join(' · ')}</span>
                )}
                {revealed.has(s.id) && <span className="mono barcode-reveal">{s.barcode}</span>}
              </span>
              <span className="qty">{s.delta > 0 ? `+${s.delta}` : s.delta}</span>
              <span className="muted">{s.scanned_at}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="muted">Nothing scanned yet.</li>}
        </ul>
      </div>
    </section>
  );
}
