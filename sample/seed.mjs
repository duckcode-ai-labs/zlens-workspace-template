#!/usr/bin/env node
// The starter warehouse: a few hundred invented orders, the same rows every run.
//
//   npm run sample:duckdb          # installs the DuckDB driver into .dql/connectors (git-ignored)
//   node sample/seed.mjs           # writes sample/starter.duckdb (and sample/seed.json)
//   node sample/seed.mjs --print   # prints portable ANSI SQL to seed the same tables in your warehouse
//   node sample/seed.mjs --print --dialect postgres|snowflake|duckdb
//
// Nothing here is real: customers are "Test Customer 0001", regions and
// products are generic, dates are in 2026. The generator is deterministic
// (mulberry32), so a rebuilt file matches the committed one row for row.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const REGIONS = ['North', 'South', 'East', 'West'];
const SEGMENTS = ['Enterprise', 'Mid-market', 'Small business'];
const PRODUCTS = ['Starter', 'Standard', 'Plus', 'Premium', 'Add-on'];
const PRICES = { Starter: 49, Standard: 129, Plus: 299, Premium: 749, 'Add-on': 25 };
const STATUSES = ['placed', 'shipped', 'delivered', 'delivered', 'delivered', 'returned', 'cancelled'];

/** mulberry32: a small deterministic generator, so every run builds the same warehouse. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (value, width) => String(value).padStart(width, '0');
const day = (offset) => new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
const money = (value) => Math.round(value * 100) / 100;

/** The tables, in the shape the open-source seed script reads (scripts/seed-eval-warehouse.mjs). */
export function starterTables() {
  const next = random(20261015);
  const pick = (items) => items[Math.floor(next() * items.length)];

  const customers = [];
  for (let index = 1; index <= 40; index += 1) {
    const id = pad(index, 4);
    customers.push({
      customer_id: `C-${id}`,
      customer_name: `Test Customer ${id}`,
      region: REGIONS[(index - 1) % REGIONS.length],
      segment: pick(SEGMENTS),
      signed_up_on: day(-Math.floor(next() * 400)),
    });
  }

  const orders = [];
  for (let index = 1; index <= 600; index += 1) {
    const customer = pick(customers);
    const product = pick(PRODUCTS);
    const quantity = 1 + Math.floor(next() * 4);
    const discount = next() < 0.2 ? 0.1 : 0;
    orders.push({
      order_id: `O-${pad(index, 5)}`,
      customer_id: customer.customer_id,
      region: customer.region,
      product,
      status: pick(STATUSES),
      order_date: `${day(Math.floor(next() * 270))} ${pad(Math.floor(next() * 24), 2)}:${pad(Math.floor(next() * 60), 2)}:00`,
      quantity,
      amount: money(PRICES[product] * quantity * (1 - discount)),
    });
  }
  orders.sort((a, b) => (a.order_date < b.order_date ? -1 : a.order_date > b.order_date ? 1 : 0));

  return {
    customers: {
      columns: [
        { name: 'customer_id', type: 'text' },
        { name: 'customer_name', type: 'text' },
        { name: 'region', type: 'text' },
        { name: 'segment', type: 'text' },
        { name: 'signed_up_on', type: 'timestamp' },
      ],
      rows: customers,
    },
    orders: {
      columns: [
        { name: 'order_id', type: 'text' },
        { name: 'customer_id', type: 'text' },
        { name: 'region', type: 'text' },
        { name: 'product', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'order_date', type: 'timestamp' },
        { name: 'quantity', type: 'int' },
        { name: 'amount', type: 'decimal' },
      ],
      rows: orders,
    },
  };
}

const TYPES = {
  duckdb: { text: 'VARCHAR', int: 'INTEGER', decimal: 'DOUBLE', timestamp: 'TIMESTAMP' },
  postgres: { text: 'text', int: 'integer', decimal: 'numeric(18,2)', timestamp: 'timestamp' },
  snowflake: { text: 'STRING', int: 'INTEGER', decimal: 'NUMBER(18,2)', timestamp: 'TIMESTAMP_NTZ' },
  ansi: { text: 'VARCHAR(255)', int: 'INTEGER', decimal: 'DECIMAL(18,2)', timestamp: 'TIMESTAMP' },
};

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
const literal = (value) => (value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`);

export function statements(tables, dialect = 'ansi') {
  const types = TYPES[dialect] ?? TYPES.ansi;
  const out = [];
  for (const [table, def] of Object.entries(tables)) {
    const columns = def.columns.map((c) => `${quote(c.name)} ${types[c.type] ?? types.text}`).join(', ');
    out.push(`DROP TABLE IF EXISTS ${quote(table)}`);
    out.push(`CREATE TABLE ${quote(table)} (${columns})`);
    const names = def.columns.map((c) => quote(c.name)).join(', ');
    for (const row of def.rows) out.push(`INSERT INTO ${quote(table)} (${names}) VALUES (${def.columns.map((c) => literal(row[c.name])).join(', ')})`);
  }
  return out;
}

/** The DuckDB driver from .dql/connectors (the project-local install ZLens uses), else from node_modules. */
function loadDuckDb() {
  const require = createRequire(import.meta.url);
  for (const candidate of [join(root, '.dql', 'connectors', 'node_modules', 'duckdb'), 'duckdb']) {
    try { return require(candidate); } catch { /* next */ }
  }
  console.error('The DuckDB driver is not installed. Run `npm run sample:duckdb` (npm install --prefix .dql/connectors duckdb@1.1.3), or use --print to get SQL for your warehouse.');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
  const tables = starterTables();

  if (args.includes('--print')) {
    console.log(statements(tables, flag('--dialect') ?? 'ansi').map((s) => `${s};`).join('\n'));
    return;
  }

  const out = resolve(flag('--out') ?? join(here, 'starter.duckdb'));
  writeFileSync(join(here, 'seed.json'), `${JSON.stringify({ tables }, null, 2)}\n`);
  mkdirSync(dirname(out), { recursive: true });
  if (existsSync(out)) rmSync(out);
  if (existsSync(`${out}.wal`)) rmSync(`${out}.wal`);

  const duckdb = loadDuckDb();
  const db = new duckdb.Database(out);
  const connection = db.connect();
  const run = (sql) => new Promise((ok, fail) => connection.run(sql, (error) => (error ? fail(error) : ok())));
  for (const sql of statements(tables, 'duckdb')) await run(sql);
  await run('CHECKPOINT');
  await new Promise((ok, fail) => connection.close((error) => (error ? fail(error) : ok())));
  await new Promise((ok, fail) => db.close((error) => (error ? fail(error) : ok())));
  const rows = Object.values(tables).reduce((n, t) => n + t.rows.length, 0);
  console.log(`Seeded ${Object.keys(tables).length} tables (${rows} rows) into ${out}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
