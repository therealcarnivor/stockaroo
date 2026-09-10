import { useState } from 'react';
import { changePassword, updateProfile } from '../api.js';
import { AVATARS } from '../avatars.js';

export default function ProfilePage({ user, forced = false, onUpdated }) {
  const [avatar, setAvatar] = useState(user?.avatar || AVATARS[0]);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickAvatar = async (emoji) => {
    setAvatar(emoji);
    try {
      await updateProfile({ avatar: emoji });
      onUpdated?.();
    } catch (err) {
      setStatus({ kind: 'error', text: err.message });
    }
  };

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
      onUpdated?.();
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
      <h1>{forced ? 'Set a new password' : 'Profile'}</h1>

      {!forced && (
        <div className="card">
          <div className="row">
            <span className="avatar-lg">{avatar}</span>
            <div>
              <strong>{user.username}</strong>
              <p className="muted">{user.is_admin ? 'Administrator' : 'Standard user'}</p>
            </div>
          </div>
          <label>Avatar</label>
          <div className="avatar-grid">
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`avatar-option ${emoji === avatar ? 'selected' : ''}`}
                onClick={() => pickAvatar(emoji)}
                aria-label={`Use ${emoji} as avatar`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="card" onSubmit={submit}>
        <h2>{forced ? 'Choose a password' : 'Change password'}</h2>
        {forced && <p className="muted">Your password must be changed before you can continue.</p>}
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
      </form>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </section>
  );
}
