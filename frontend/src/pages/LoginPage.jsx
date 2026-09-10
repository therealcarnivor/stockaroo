import { useState } from 'react';
import { login } from '../api.js';

export default function LoginPage({ onAuthed }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      setPassword('');
      onAuthed();
    } catch (err) {
      setError(err.offline ? 'No connection.' : 'Incorrect username or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack narrow">
      <h1>Sign in</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button className="btn primary" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p className="status error">{error}</p>}
      </form>
    </section>
  );
}
