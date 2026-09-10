import { useState } from 'react';
import { changePassword } from '../api.js';

export default function ChangePasswordPage({ forced = false, onDone }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) return setStatus({ kind: 'error', text: 'Passwords do not match.' });
    if (newPassword.length < 8) return setStatus({ kind: 'error', text: 'Use at least 8 characters.' });

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setStatus({ kind: 'ok', text: 'Password updated.' });
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone?.();
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err.message === 'invalid_credentials' ? 'Current password is wrong.' : err.message
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack narrow">
      <h1>{forced ? 'Set a new password' : 'Change password'}</h1>
      {forced && <p className="muted">Your password must be changed before you can continue.</p>}
      <form className="card" onSubmit={submit}>
        <label htmlFor="current">Current password</label>
        <input
          id="current"
          className="input"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <label htmlFor="next">New password</label>
        <input
          id="next"
          className="input"
          type="password"
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <label htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          className="input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <button className="btn primary" type="submit" disabled={busy}>Update password</button>
        {status && <p className={`status ${status.kind}`}>{status.text}</p>}
      </form>
    </section>
  );
}
