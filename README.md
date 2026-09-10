# Stockaroo

A home food-stock tracker. Scan barcodes with a Bluetooth or USB HID barcode
scanner (the kind that behaves like a keyboard) to record what you have in,
what you've used up, and what needs buying again.

The whole design is built around one idea: the fastest way to keep a kitchen
inventory honest is to make logging take less than a second. Point, beep, done.
There's no product-database lookup to wait on, no photo to take, no form to
fill in — a barcode arrives as keystrokes, the count changes, and you move on
to the next tin. Anything that adds friction to that moment means the log stops
getting updated, and a stock list nobody updates is worse than no stock list.

That's why the rest of the app stays deliberately small. Items carry only what
you need to shop from — a name, the store, the pack size and a count — and the
only clever bit is a minimum stock level that decides when something belongs on
the shopping list. Everything lives in a single SQLite file on your own machine,
so there's no account to create, no subscription, and no third-party service
holding a record of your groceries.

Works on desktops and on iPhones/iPads with a paired Bluetooth scanner.

## Features

- **Scan in / scan out** — one input field stays focused so scanner keystrokes
  always land in the right place. Toggle between *Stock in* and *Use up*.
- **First-time barcodes** prompt for a product name, store, size and whether
  it's frozen, so "Tesco", "Sour Cream & Chive Dip" and "200g" stay in
  separate fields.
- **Items list** with search across name, store, size and barcode, a
  frozen/non-frozen filter, tap-through to a detail page, and inline +/−
  quantity controls.
- **Item page** — full details, edit name/store/size, minimum stock level,
  totals stocked in and used up, and the complete scan history.
- **Shopping list** — set a minimum stock level per item; once stock reaches
  it the row turns red and the item appears under the *To buy only* filter.
  Export the list as a plain-text file grouped by store.
- **Curated stores** — admins maintain the store list; items pick from a
  dropdown rather than free text.
- **Admin dashboard** — at-a-glance counts of items, frozen items, items to
  buy, out-of-stock items, stores and users.
- **Users and roles** — username/password login, admin-only user management,
  password resets, forced password change on first sign-in, emoji avatars.
- **Full backup and restore** — export the entire database (items, scans,
  stores, users) to JSON and restore it.
- **Offline tolerant** — scans made while offline are queued locally and sync
  automatically when the connection returns. A service worker caches the app
  shell.
- **Light and dark themes**, responsive down to phone width with no sideways
  scrolling.

## Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | React 18, Vite, React Router         |
| Styling  | Hand-written CSS with theme tokens   |
| Backend  | Node.js 20, Express                  |
| Database | SQLite via better-sqlite3            |
| Deploy   | Docker / docker compose              |

## Getting started

### Development

```bash
cd backend  && npm install && npm run dev   # http://localhost:3000
cd frontend && npm install && npm run dev   # http://localhost:5173
```

The Vite dev server proxies `/api` to the backend.

### Tests

```bash
cd backend && npm test
```

### Docker

```bash
cp .env.example .env      # set STOCKAROO_INITIAL_ADMIN_PASSWORD
docker compose up --build # http://localhost:3003
```

## Configuration

| Variable                 | Default      | Purpose                                            |
| ------------------------ | ------------ | -------------------------------------------------- |
| `DATA_DIR`               | `./data`     | Where the SQLite database lives                    |
| `PORT`                   | `3000`       | HTTP port                                          |
| `TRUST_PROXY_HOPS`       | `1`          | Reverse-proxy hops to trust for client IPs         |
| `INITIAL_ADMIN_USER`     | `admin`      | Seeded admin username (empty database only)        |
| `INITIAL_ADMIN_PASSWORD` | `stockaroo`  | Seeded admin password; the default forces a change |

## First run

An admin account is seeded the first time the database is created. If no
password was supplied the account is `admin` / `stockaroo` and must be changed
at first sign-in.

## Data model

- **items** — barcode, name, store, size, quantity, minimum stock level
- **scans** — every stock-in and use-up event, linked to an item
- **stores** — the curated store list
- **users** / **sessions** — accounts (scrypt-hashed passwords) and login sessions

Aggregate counts across these tables are served from `/api/stats` and shown on
the admin dashboard.

## Backups

`Admin → Backup → Export everything` downloads a JSON snapshot of the whole
database. It contains password hashes, so store it securely. Restoring
replaces all existing data and signs everyone out.

## Licence

See [LICENSE](LICENSE).
