import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import ScanPage from './pages/ScanPage.jsx';
import ItemsPage from './pages/ItemsPage.jsx';
import ItemPage from './pages/ItemPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminStoresPage from './pages/AdminStoresPage.jsx';
import AdminBrandsPage from './pages/AdminBrandsPage.jsx';
import AdminCategoriesPage from './pages/AdminCategoriesPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import useTheme from './useTheme.js';
import { logout, me } from './api.js';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [session, setSession] = useState(null); // null while unknown
  const [online, setOnline] = useState(navigator.onLine);

  const refreshSession = useCallback(
    () => me().then(setSession).catch(() => setSession({ authed: false, user: null })),
    []
  );

  useEffect(() => { refreshSession(); }, [refreshSession]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const signOut = async () => {
    await logout().catch(() => {});
    refreshSession();
  };

  const user = session?.user;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Stockaroo</span>
        {user && !user.must_change_password && (
          <nav>
            <NavLink to="/" end>Scan</NavLink>
            <NavLink to="/items">Items</NavLink>
            {user.is_admin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
        )}
        {!online && <span className="pill offline">Offline</span>}
        {user && !user.must_change_password && (
          <NavLink to="/profile" className="avatar-link" title={`${user.username} — profile`}>
            <span className="avatar">{user.avatar}</span>
          </NavLink>
        )}
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        {user && <button className="icon-btn" onClick={signOut}>Sign out</button>}
      </header>

      <main className="content">
        {session === null ? (
          <p className="muted">Loading…</p>
        ) : !user ? (
          <LoginPage onAuthed={refreshSession} />
        ) : user.must_change_password ? (
          <ProfilePage user={user} forced onUpdated={refreshSession} />
        ) : (
          <Routes>
            <Route path="/" element={<ScanPage online={online} />} />
            <Route path="/items" element={<ItemsPage online={online} />} />
            <Route path="/items/:id" element={<ItemPage isAdmin={user.is_admin} />} />
            <Route path="/profile" element={<ProfilePage user={user} onUpdated={refreshSession} />} />
            <Route
              path="/admin"
              element={user.is_admin ? <AdminPage /> : <p>Not allowed.</p>}
            />
            <Route
              path="/admin/users"
              element={user.is_admin ? <AdminUsersPage currentUser={user} /> : <p>Not allowed.</p>}
            />
            <Route
              path="/admin/stores"
              element={user.is_admin ? <AdminStoresPage /> : <p>Not allowed.</p>}
            />
            <Route
              path="/admin/brands"
              element={user.is_admin ? <AdminBrandsPage /> : <p>Not allowed.</p>}
            />
            <Route
              path="/admin/categories"
              element={user.is_admin ? <AdminCategoriesPage /> : <p>Not allowed.</p>}
            />
            <Route path="*" element={<p>Not found.</p>} />
          </Routes>
        )}
      </main>
    </div>
  );
}
