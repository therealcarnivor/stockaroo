const request = async (url, options = {}) => {
  let res;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (cause) {
    throw Object.assign(new Error('offline'), { offline: true, cause });
  }

  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { status: res.status, body });
  return body;
};

export const me = () => request('/api/auth/me');
export const login = (username, password) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
export const logout = () => request('/api/auth/logout', { method: 'POST' });
export const changePassword = (currentPassword, newPassword) =>
  request('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  });
export const updateProfile = (patch) =>
  request('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(patch) });

export const listUsers = () => request('/api/users');
export const createUser = (user) =>
  request('/api/users', { method: 'POST', body: JSON.stringify(user) });
export const updateUser = (id, patch) =>
  request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteUser = (id) => request(`/api/users/${id}`, { method: 'DELETE' });

export const listStores = () => request('/api/stores');
export const createStore = (name) =>
  request('/api/stores', { method: 'POST', body: JSON.stringify({ name }) });
export const updateStore = (id, name) =>
  request(`/api/stores/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
export const deleteStore = (id, force = false) =>
  request(`/api/stores/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' });

export const exportBackup = () => request('/api/backup');
export const restoreBackup = (data) =>
  request('/api/restore', { method: 'POST', body: JSON.stringify({ data }) });

export const getStats = () => request('/api/stats');

export const listItems = (q = '', neededOnly = false, frozen = null) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (neededOnly) params.set('needed', '1');
  if (frozen !== null) params.set('frozen', frozen ? '1' : '0');
  const query = params.toString();
  return request(`/api/items${query ? `?${query}` : ''}`);
};

export const listScans = () => request('/api/scans');

export const itemHistory = (id) => request(`/api/items/${id}/history`);

export const scan = ({ barcode, name = null, store = null, size = null, frozen = false, delta = 1 }) =>
  request('/api/scans', {
    method: 'POST',
    body: JSON.stringify({ barcode, name, store, size, frozen, delta })
  });

export const updateItem = (id, patch) =>
  request(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteItem = (id) => request(`/api/items/${id}`, { method: 'DELETE' });
