const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stockaroo-test-'));
process.env.INITIAL_ADMIN_USER = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-password';
process.env.NODE_ENV = 'test';

const app = require('../src/app');

let base;
let server;
let cookie = '';

const api = (method, url, body, opts = {}) =>
  fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie === undefined ? (cookie ? { Cookie: cookie } : {}) : opts.cookie ? { Cookie: opts.cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

const cookieFrom = (res) => res.headers.getSetCookie()[0].split(';')[0];

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('health is public', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.deepEqual(await res.json(), { ok: true });
});

test('protected routes reject anonymous requests', async () => {
  const res = await api('GET', '/api/items', undefined, { cookie: null });
  assert.equal(res.status, 401);
});

test('login rejects bad credentials', async () => {
  const res = await api('POST', '/api/auth/login', { username: 'admin', password: 'nope' }, { cookie: null });
  assert.equal(res.status, 401);
});

test('seeded admin can log in', async () => {
  const res = await api(
    'POST',
    '/api/auth/login',
    { username: 'admin', password: 'admin-password' },
    { cookie: null }
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.is_admin, true);
  assert.equal(body.user.must_change_password, false);
  cookie = cookieFrom(res);
});

test('me reports the signed-in user', async () => {
  const body = await (await api('GET', '/api/auth/me')).json();
  assert.equal(body.user.username, 'admin');
});

test('unknown barcode asks for a name', async () => {
  const res = await api('POST', '/api/scans', { barcode: '111' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'unknown_barcode');
});

test('scan with a name creates the item, repeats increment', async () => {
  let item = await (await api('POST', '/api/scans', { barcode: '111', name: 'Beans' })).json();
  assert.equal(item.quantity, 1);
  item = await (await api('POST', '/api/scans', { barcode: '111' })).json();
  assert.equal(item.quantity, 2);
  item = await (await api('POST', '/api/scans', { barcode: '111', source: 'manual' })).json();
  assert.equal(item.quantity, 3);
  const scans = await (await api('GET', '/api/scans')).json();
  assert.equal(scans[0].source, 'manual');
});

test('scan-out decrements and never goes below zero', async () => {
  let item = await (await api('POST', '/api/scans', { barcode: '111', delta: -1 })).json();
  assert.equal(item.quantity, 2);
  item = await (await api('POST', '/api/scans', { barcode: '111', delta: -5 })).json();
  assert.equal(item.quantity, 0);
});

test('admins can configure mqtt scanner settings without exposing the password', async () => {
  let res = await api('PUT', '/api/settings/mqtt', { enabled: true, url: '', topic: '' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'mqtt_missing_config');

  res = await api('PUT', '/api/settings/mqtt', {
    enabled: false,
    url: 'mqtt://broker.local:1883',
    topic: 'stockaroo/scans',
    username: 'scanner',
    password: 'secret',
    clientId: 'stockaroo-test',
    delta: 1
  });
  assert.equal(res.status, 200);
  let body = await res.json();
  assert.equal(body.url, 'mqtt://broker.local:1883');
  assert.equal(body.topic, 'stockaroo/scans');
  assert.equal(body.password, undefined);
  assert.equal(body.passwordSet, true);

  body = await (await api('GET', '/api/settings/mqtt')).json();
  assert.equal(body.password, undefined);
  assert.equal(body.passwordSet, true);
});

test('scan page can set mqtt scan direction', async () => {
  const res = await api('POST', '/api/settings/mqtt/direction', { direction: -1 });
  assert.equal(res.status, 200);
  const body = await (await api('GET', '/api/settings/mqtt')).json();
  assert.equal(body.delta, -1);
});

test('invalid barcode is rejected', async () => {
  const res = await api('POST', '/api/scans', { barcode: 'bad barcode!' });
  assert.equal(res.status, 400);
});

test('a full backup round-trips the whole database', async () => {
  // Seed a second item so the backup has something to compare against.
  await api('POST', '/api/scans', { barcode: '222', name: 'Rice' });
  await api('POST', '/api/scans', { barcode: '333', name: 'Pasta' });
  await api('POST', '/api/scans', { barcode: '222', delta: 3 });

  // Assign a brand, category and barcode alias so their round-trip can be checked too.
  await api('POST', '/api/brands', { name: 'Tilda' });
  await api('POST', '/api/categories', { name: 'Grains' });
  const before = await (await api('GET', '/api/items')).json();
  const rice = before.find((i) => i.barcode === '222');
  await api('PATCH', `/api/items/${rice.id}`, { brand: 'Tilda', category: 'Grains' });
  await api('POST', `/api/items/${rice.id}/barcodes`, { barcode: '222-ALT' });
  const grains = await (await api('GET', '/api/items?category=Grains')).json();
  assert.ok(grains.some((i) => i.barcode === '222'));

  const backup = await (await api('GET', '/api/backup')).json();
  assert.equal(backup.version, 6);
  assert.ok(backup.items.length >= 2);
  assert.ok(backup.brands.some((b) => b.name === 'Tilda'));
  assert.ok(backup.categories.some((c) => c.name === 'Grains'));
  assert.ok(backup.items.find((i) => i.barcode === '222').brand === 'Tilda');
  assert.ok(backup.items.find((i) => i.barcode === '222').category === 'Grains');
  assert.ok(backup.item_barcodes.some((b) => b.barcode === '222-ALT'));
  assert.ok(backup.users.some((u) => u.username === 'admin' && u.password_hash));
  assert.ok(backup.scans.length > 0);
  assert.ok(backup.scans.every((s) => typeof s.created === 'number'));

  // Wipe an item, then restore and confirm it comes back.
  const doomed = backup.items[0];
  await api('DELETE', `/api/items/${doomed.id}`);
  assert.equal((await (await api('GET', '/api/items')).json()).length, backup.items.length - 1);

  const result = await (await api('POST', '/api/restore', { data: backup })).json();
  assert.equal(result.items, backup.items.length);
  assert.equal(result.brands, backup.brands.length);
  assert.equal(result.categories, backup.categories.length);
  assert.equal(result.users, backup.users.length);

  // The restore drops sessions, so sign back in.
  const login = await api(
    'POST',
    '/api/auth/login',
    { username: 'admin', password: 'admin-password' },
    { cookie: null }
  );
  assert.equal(login.status, 200);
  cookie = cookieFrom(login);

  const items = await (await api('GET', '/api/items')).json();
  assert.equal(items.length, backup.items.length);
  assert.ok(items.some((i) => i.barcode === doomed.barcode));

  // Confirm the brand and extra barcode alias survived the restore.
  const restoredRice = items.find((i) => i.barcode === '222');
  assert.equal(restoredRice.brand, 'Tilda');
  assert.equal(restoredRice.category, 'Grains');
  const riceHistory = await (await api('GET', `/api/items/${restoredRice.id}/history`)).json();
  assert.ok(riceHistory.item.barcodes.includes('222-ALT'));

  const brandsAfter = await (await api('GET', '/api/brands')).json();
  assert.ok(brandsAfter.some((b) => b.name === 'Tilda'));
  const categoriesAfter = await (await api('GET', '/api/categories')).json();
  assert.ok(categoriesAfter.some((c) => c.name === 'Grains'));
});

test('restore rejects a backup with no admin', async () => {
  const res = await api('POST', '/api/restore', {
    data: { version: 2, items: [], stores: [], scans: [], users: [] }
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'no_admin_in_backup');
});

test('frozen goods can be flagged and filtered', async () => {
  const res = await api('POST', '/api/scans', { barcode: '555', name: 'Peas', frozen: true });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).frozen, 1);

  const frozen = await (await api('GET', '/api/items?frozen=1')).json();
  assert.deepEqual(frozen.map((i) => i.barcode), ['555']);

  const ambient = await (await api('GET', '/api/items?frozen=0')).json();
  assert.ok(ambient.length > 0);
  assert.ok(!ambient.some((i) => i.barcode === '555'));

  const [item] = frozen;
  await api('PATCH', `/api/items/${item.id}`, { frozen: false });
  assert.deepEqual(await (await api('GET', '/api/items?frozen=1')).json(), []);

  await api('DELETE', `/api/items/${item.id}`);
});

test('a minimum stock level puts an item on the to-buy list', async () => {
  const [item] = await (await api('GET', '/api/items?q=Rice')).json();
  assert.equal(item.quantity, 4);

  // Above the minimum: not needed.
  let res = await api('PATCH', `/api/items/${item.id}`, { min_stock: 2 });
  assert.equal(res.status, 200);
  assert.deepEqual(await (await api('GET', '/api/items?needed=1')).json(), []);

  // At or below the minimum: needed.
  await api('PATCH', `/api/items/${item.id}`, { min_stock: 4 });
  const needed = await (await api('GET', '/api/items?needed=1')).json();
  assert.deepEqual(needed.map((i) => i.barcode), [item.barcode]);
  assert.equal(needed[0].needed, 1);

  // A zero minimum switches the tracking off entirely.
  await api('PATCH', `/api/items/${item.id}`, { min_stock: 0 });
  assert.deepEqual(await (await api('GET', '/api/items?needed=1')).json(), []);

  res = await api('PATCH', `/api/items/${item.id}`, { min_stock: -1 });
  assert.equal(res.status, 400);
});

test('stores are curated and enforced on items', async () => {
  let res = await api('POST', '/api/scans', { barcode: '444', name: 'Crisps', store: 'Nowhere' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'unknown_store');

  res = await api('POST', '/api/stores', { name: 'Tesco' });
  assert.equal(res.status, 201);
  const store = await res.json();

  res = await api('POST', '/api/scans', {
    barcode: '444',
    name: 'Crisps',
    store: 'Tesco',
    size: '150g'
  });
  assert.equal(res.status, 201);
  const item = await res.json();
  assert.equal(item.store, 'Tesco');
  assert.equal(item.size, '150g');

  // Renaming a store follows through to the items referencing it.
  res = await api('PATCH', `/api/stores/${store.id}`, { name: 'Tesco Extra' });
  assert.equal(res.status, 200);
  const [renamed] = await (await api('GET', '/api/items?q=Crisps')).json();
  assert.equal(renamed.store, 'Tesco Extra');

  // In-use stores need an explicit force before deletion.
  res = await api('DELETE', `/api/stores/${store.id}`);
  assert.equal(res.status, 409);
  res = await api('DELETE', `/api/stores/${store.id}?force=1`);
  assert.equal(res.status, 204);

  const [cleared] = await (await api('GET', '/api/items?q=Crisps')).json();
  assert.equal(cleared.store, '');

  await api('DELETE', `/api/items/${cleared.id}`);
});

test('admin can create a user who must change their password', async () => {
  const res = await api('POST', '/api/users', {
    username: 'shopper',
    password: 'temp-password',
    is_admin: false
  });
  assert.equal(res.status, 201);
  const user = await res.json();
  assert.equal(user.must_change_password, true);
  assert.equal(user.is_admin, false);
});

test('duplicate usernames and short passwords are rejected', async () => {
  let res = await api('POST', '/api/users', { username: 'shopper', password: 'another-one' });
  assert.equal(res.status, 409);
  res = await api('POST', '/api/users', { username: 'someone', password: 'short' });
  assert.equal(res.status, 400);
});

test('a forced password change gates writes until completed', async () => {
  const login = await api(
    'POST',
    '/api/auth/login',
    { username: 'shopper', password: 'temp-password' },
    { cookie: null }
  );
  let userCookie = cookieFrom(login);

  let res = await api('POST', '/api/scans', { barcode: '222' }, { cookie: userCookie });
  assert.equal(res.status, 403);

  res = await api(
    'POST',
    '/api/auth/password',
    { currentPassword: 'temp-password', newPassword: 'brand-new-password' },
    { cookie: userCookie }
  );
  assert.equal(res.status, 200);
  userCookie = cookieFrom(res);

  res = await api('POST', '/api/scans', { barcode: '222' }, { cookie: userCookie });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).quantity, 5);
});

test('non-admins cannot reach admin routes', async () => {
  const login = await api(
    'POST',
    '/api/auth/login',
    { username: 'shopper', password: 'brand-new-password' },
    { cookie: null }
  );
  const userCookie = cookieFrom(login);

  for (const url of ['/api/users', '/api/backup']) {
    const res = await api('GET', url, undefined, { cookie: userCookie });
    assert.equal(res.status, 403, url);
  }
});

test('the last admin cannot be demoted or deleted', async () => {
  const users = await (await api('GET', '/api/users')).json();
  const admin = users.find((u) => u.username === 'admin');

  let res = await api('PATCH', `/api/users/${admin.id}`, { is_admin: false });
  assert.equal(res.status, 409);
  res = await api('DELETE', `/api/users/${admin.id}`);
  assert.equal(res.status, 409);
});

test('admin can reset a password and delete a user', async () => {
  const users = await (await api('GET', '/api/users')).json();
  const shopper = users.find((u) => u.username === 'shopper');

  let res = await api('PATCH', `/api/users/${shopper.id}`, { password: 'reset-password' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).must_change_password, true);

  // The reset invalidates the old session.
  const login = await api(
    'POST',
    '/api/auth/login',
    { username: 'shopper', password: 'brand-new-password' },
    { cookie: null }
  );
  assert.equal(login.status, 401);

  res = await api('DELETE', `/api/users/${shopper.id}`);
  assert.equal(res.status, 204);
});

test('logout clears the session', async () => {
  const res = await api('POST', '/api/auth/logout');
  assert.equal(res.status, 200);
  const after = await api('GET', '/api/items');
  assert.equal(after.status, 401);
});
