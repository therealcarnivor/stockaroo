import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(null);

  const refresh = useCallback(() => listCategories().then(setCategories).catch(() => {}), []);
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
    const ok = await run(() => createCategory(categoryName.trim()), 'Category added.');
    if (ok) setCategoryName('');
  };

  const save = async (category) => {
    const ok = await run(() => updateCategory(category.id, draft.trim()), 'Category renamed.');
    if (ok) setEditing(null);
  };

  const remove = async (category) => {
    try {
      await deleteCategory(category.id);
      setStatus({ kind: 'ok', text: 'Category deleted.' });
      refresh();
    } catch (err) {
      if (err.body?.error === 'category_in_use') {
        if (!confirm(`${err.body.items} item(s) use "${category.name}". Delete anyway and clear them?`)) {
          return;
        }
        await run(() => deleteCategory(category.id, true), 'Category deleted.');
      } else {
        setStatus({ kind: 'error', text: ADMIN_ERRORS[err.message] || err.message });
      }
    }
  };

  return (
    <section className="stack">
      <div className="row spread">
        <h1>Categories</h1>
        <Link className="btn small" to="/admin">← Admin</Link>
      </div>

      <form className="card" onSubmit={add}>
        <div className="row">
          <input
            className="input grow"
            placeholder="Category name, e.g. Pantry"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={!categoryName.trim()}>Add category</button>
        </div>
      </form>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}

      <ul className="list">
        {categories.map((category) => (
          <li key={category.id} className="store-row">
            {editing === category.id ? (
              <>
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                />
                <span className="row">
                  <button className="btn small primary" onClick={() => save(category)}>Save</button>
                  <button className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                </span>
              </>
            ) : (
              <>
                <span>{category.name}</span>
                <span className="row">
                  <span className="muted">{category.itemCount} item{category.itemCount === 1 ? '' : 's'}</span>
                  <button
                    className="btn small"
                    onClick={() => { setEditing(category.id); setDraft(category.name); }}
                  >
                    Rename
                  </button>
                  <button className="btn small danger" onClick={() => remove(category)}>Delete</button>
                </span>
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && <li className="muted">No categories yet.</li>}
      </ul>
    </section>
  );
}
