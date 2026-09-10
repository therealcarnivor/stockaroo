# Stockaroo

A home food-stock tracker. Scan barcodes with a Bluetooth or USB HID barcode
scanner (the kind that behaves like a keyboard) to record what you have in,
what you've used up, and what needs buying again.

Works on desktops and on iPhones/iPads with a paired Bluetooth scanner.

## Features

- **Scan in / scan out** — one input field stays focused so scanner keystrokes
  always land in the right place. Toggle between *Stock in* and *Use up*.
- **First-time barcodes** prompt for a product name, store and size, so
  "Tesco", "Sour Cream & Chive Dip" and "200g" stay in separate fields.
- **Items list** with search across name, store, size and barcode, tap-through
  to a detail page, and inline +/− quantity controls.
- **Item page** — full details, edit name/store/size, minimum stock level,
  totals stocked in and used up, and the complete scan history.
- **Shopping list** — set a minimum stock level per item; once stock reaches
  it the row turns red and the item appears under the *To buy only* filter.
  Export the list as a plain-text file grouped by store.
- **Curated stores** — admins maintain the store list; items pick from a
  dropdown rather than free text.
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

## Backups

`Admin → Backup → Export everything` downloads a JSON snapshot of the whole
database. It contains password hashes, so store it securely. Restoring
replaces all existing data and signs everyone out.

## Licence

See [LICENSE](LICENSE).Stockaroo
