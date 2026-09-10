import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createUser, deleteUser, listUsers, updateUser } from '../api.js';
import { ADMIN_ERRORS } from '../adminErrors.js';

export default function AdminUsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', is_admin: false });
  const [resetting, setResetting] = useState(null);
  const [resetValue, setResetValue] = useState('');
  const [status, setStatus] = useState(null);

  const refresh = useCallback(() => listUsers().then(setUsers).catch(() => {}), []);
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
    const ok = await run(() => createUser({ ...form, username: form.username.trim() }), 'User created.');
    if (ok) setForm({ username: '', password: '', is_admin: false });
  };

  const resetPassword = async (user) => {
    const ok = await run(
      () => updateUser(user.id, { password: resetValue }),
      `Password reset for ${user.username}.`
    );
    if (ok) {
      setResetting(null);
      setResetValue('');
    }
  };

  return (
    <section className="stack">
      <div className="row spread">
        <h1>Users</h1>
        <Link className="btn small" to="/admin">← Admin</Link>
      </div>

      <form className="card" onSubmit={add}>
        <h2>Add user</h2>
        <div className="row">
          <input
            className="input grow"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            className="input grow"
            type="password"
            placeholder="Temporary password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
          />
          <label className="check">
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
            />
            Admin
          </label>
          <button className="btn primary" type="submit">Create</button>
        </div>
      </form>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th className="center">Admin</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label="User">
                  <span className="avatar">{user.avatar}</span> {user.username}
                  {user.id === currentUser.id && <span className="muted"> (you)</span>}
                </td>
                <td className="center" data-label="Admin">
                  <input
                    type="checkbox"
                    checked={user.is_admin}
                    onChange={(e) =>
                      run(() => updateUser(user.id, { is_admin: e.target.checked }), 'User updated.')
                    }
                  />
                </td>
                <td className="muted" data-label="Status">
                  {user.must_change_password ? 'Must change password' : 'Active'}
                </td>
                <td className="muted" data-label="Created">{user.created_at}</td>
                <td data-label="Actions">
                  {resetting === user.id ? (
                    <span className="row">
                      <input
                        className="input"
                        type="password"
                        placeholder="New password"
                        value={resetValue}
                        onChange={(e) => setResetValue(e.target.value)}
                        autoFocus
                      />
                      <button className="btn small primary" onClick={() => resetPassword(user)}>
                        Save
                      </button>
                      <button className="btn small" onClick={() => setResetting(null)}>Cancel</button>
                    </span>
                  ) : (
                    <span className="row">
                      <button
                        className="btn small"
                        onClick={() => { setResetting(user.id); setResetValue(''); }}
                      >
                        Reset password
                      </button>
                      <button
                        className="btn small danger"
                        disabled={user.id === currentUser.id}
                        onClick={() =>
                          confirm(`Delete user "${user.username}"?`) &&
                          run(() => deleteUser(user.id), 'User deleted.')
                        }
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
