import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createBrand, deleteBrand, listBrands, updateBrand } from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState([]);
  const [brandName, setBrandName] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(null);

  const refresh = useCallback(() => listBrands().then(setBrands).catch(() => {}), []);
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
    const ok = await run(() => createBrand(brandName.trim()), 'Brand added.');
    if (ok) setBrandName('');
  };

  const save = async (brand) => {
    const ok = await run(() => updateBrand(brand.id, draft.trim()), 'Brand renamed.');
    if (ok) setEditing(null);
  };

  const remove = async (brand) => {
    try {
      await deleteBrand(brand.id);
      setStatus({ kind: 'ok', text: 'Brand deleted.' });
      refresh();
    } catch (err) {
      if (err.body?.error === 'brand_in_use') {
        if (!confirm(`${err.body.items} item(s) use "${brand.name}". Delete anyway and clear them?`)) {
          return;
        }
        await run(() => deleteBrand(brand.id, true), 'Brand deleted.');
      } else {
        setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
      }
    }
  };

  return (
    <section className="stack">
      <div className="row spread">
        <h1>Brands</h1>
        <Link className="btn small" to="/admin">← Admin</Link>
      </div>

      <form className="card" onSubmit={add}>
        <div className="row">
          <input
            className="input grow"
            placeholder="Brand name, e.g. Heinz"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={!brandName.trim()}>Add brand</button>
        </div>
      </form>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}

      <ul className="list">
        {brands.map((brand) => (
          <li key={brand.id} className="store-row">
            {editing === brand.id ? (
              <>
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                />
                <span className="row">
                  <button className="btn small primary" onClick={() => save(brand)}>Save</button>
                  <button className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                </span>
              </>
            ) : (
              <>
                <span>{brand.name}</span>
                <span className="row">
                  <span className="muted">{brand.itemCount} item{brand.itemCount === 1 ? '' : 's'}</span>
                  <button
                    className="btn small"
                    onClick={() => { setEditing(brand.id); setDraft(brand.name); }}
                  >
                    Rename
                  </button>
                  <button className="btn small danger" onClick={() => remove(brand)}>Delete</button>
                </span>
              </>
            )}
          </li>
        ))}
        {brands.length === 0 && <li className="muted">No brands yet.</li>}
      </ul>
    </section>
  );
}
