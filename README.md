# ZLens workspace template

The starting point for a [ZLens Enterprise](https://github.com/duckcode-ai-labs/dql-enterprise)
workspace. A workspace is one git repository: `dql.config.json` at the root,
beside the project files ZLens governs (metrics, blocks, Datasets, Apps and
notebooks). The Enterprise install runs one worker per workspace; the worker
clones this repository, and **Production follows `main`**.

Use **Use this template** on GitHub to make your own copy, then follow the hour
below. At the end you have a repository the install guide accepts: a working
warehouse connection and at least one certified metric.

What is in the box:

| Path | What it is |
|---|---|
| `dql.config.json` | The project and its default connection: PostgreSQL, password from the `ZLENS_WAREHOUSE_PASSWORD` environment variable |
| `sample/` | A seed script, the 640-row DuckDB file it builds, and a config that points at it, for the first hour |
| `semantic-layer/` | The `orders` semantic model with two certified metrics, `order_count` and `revenue` |
| `domains/orders/` | The domain (owner, review cadence) and two certified blocks: **Revenue by region** and the **Orders Dataset** |
| `apps/orders-weekly/` | The **Orders Weekly** App and its `overview` page, every tile on the certified Dataset |
| `notebooks/first-hour.dqlnb` | A notebook that runs the sample end to end |
| `.github/workflows/validate.yml` | `zlens validate` and `zlens app build` on every pull request |
| `CODEOWNERS` | Who reviews what; replace the placeholder teams |

Everything in `sample/` is invented: "Test Customer 0001", generic regions and
products. No real names, no real data.

## Your first hour

### 0. Prerequisites

- Node.js 20 or newer and npm.
- A read-only warehouse account for ZLens (PostgreSQL by default; see
  [Another warehouse](#another-warehouse)). Not needed for the first hour.
- For the Enterprise install: an admin with the OpenTofu module and the
  GitHub App ([Install on AWS](https://github.com/duckcode-ai-labs/dql-enterprise/blob/main/docs/install-aws.md),
  [GitHub App](https://github.com/duckcode-ai-labs/dql-enterprise/blob/main/docs/github-app.md)).

### 1. Run the sample (10 minutes)

```sh
npm install                 # the ZLens CLI, pinned to the release the worker runs
npm run sample:use          # dql.config.json -> the sample DuckDB file (git shows the change; do not commit it)
npm run sample:duckdb       # the DuckDB driver, into .dql/connectors (git-ignored)
npm run validate            # every DQL file parses and every semantic reference resolves
npm run doctor              # the connection opens and the project is sound
npm run notebook            # open notebooks/first-hour.dqlnb and run its cells
```

The sample file is committed (`sample/starter.duckdb`), so a worker that clones
this repository can run it with no seed step. To rebuild it, or to print SQL
that creates the same two tables in your warehouse:

```sh
node sample/seed.mjs                              # rebuilds sample/starter.duckdb, row for row
node sample/seed.mjs --print --dialect postgres   # or snowflake, duckdb, ansi
```

### 2. Point it at your warehouse (15 minutes)

Put the sample config back (`git checkout dql.config.json`) and edit the
connection in `dql.config.json`: host, port, database, schema and username are
written in the file; **the password is not**. It is read from the environment
variable `ZLENS_WAREHOUSE_PASSWORD` at run time.

```json
"connections": {
  "default": {
    "driver": "postgresql",
    "host": "warehouse.example.internal",
    "port": 5432,
    "database": "analytics",
    "schema": "public",
    "username": "zlens_reader",
    "password": "${ZLENS_WAREHOUSE_PASSWORD}",
    "sslMode": "require"
  }
}
```

Locally: `export ZLENS_WAREHOUSE_PASSWORD=...` in your shell, install the driver
(`npm install --prefix .dql/connectors pg`) and run `npm run doctor`. Set
`sslMode` to `verify-full` (with `sslRootCert` for a private CA such as the RDS
bundle) when you can.

Create the two tables the blocks read, `orders` and `customers`
(`node sample/seed.mjs --print --dialect postgres` gives the SQL), or change
the blocks' SQL to your own tables and keep going. Give the ZLens account
read-only grants: Ask runs single read-only statements, but the database is
the place that enforces it.

#### Another warehouse

Change `driver` and the connection fields; the pattern stays the same, with
secrets as `${ENV_VAR}` references. Snowflake, Databricks SQL, BigQuery,
Redshift, Athena, SQL Server, MySQL, ClickHouse and Trino are in the
[connector reference](https://duckcode-ai-labs.github.io/zlens/reference/connectors/)
([source](https://github.com/duckcode-ai-labs/zlens/blob/main/docs/reference/connectors.md)),
with each driver's install line and sign-in options. For example:

```json
"default": { "driver": "snowflake", "account": "xy12345", "username": "ZLENS_READER", "password": "${SNOWFLAKE_PASSWORD}", "warehouse": "ANALYTICS_WH", "database": "ANALYTICS", "schema": "PUBLIC" }
```

### 3. Hand it to the Enterprise admin (15 minutes)

The admin does three things, all outside this repository:

1. **Registers the repository as a workspace** in the OpenTofu module:
   ```hcl
   workspaces = {
     orders = { git_url = "https://github.com/<your-org>/<this-repo>.git" }   # git_branch defaults to main
   }
   ```
   One worker starts per workspace and clones it. Admin → Environments & git
   shows the repository and branch.
2. **Gives the worker the secret** the connection reads, as a Secrets Manager
   secret mapped to the environment variable name:
   ```hcl
   worker_warehouse_secrets = {
     ZLENS_WAREHOUSE_PASSWORD = "arn:aws:secretsmanager:us-east-1:111122223333:secret:zlens-warehouse-abc123"
   }
   ```
   Names may not start with `DQLE_` or `OTEL_`. The host must be reachable
   from the workers (`egress_domain_allowlist` with the network firewall on).
3. **Installs the GitHub App** on this repository and requires the
   **"DQL certification"** status check on `main`. From then on every change
   to Production is a pull request the App reviews.

Then the first question: open the workspace, ask "What is revenue by region?",
and check the answer carries the **Certified** label and names the block
*Revenue by region* and its owner.

### 4. Make your first change through review (20 minutes)

This is the loop every change takes, from the laptop or the browser:

1. **Draft space or branch.** In ZLens, *My draft spaces* → open one (a branch
   `dql/<you>/<topic>`, writable for you alone, on a copy of Production's
   files). Or `git switch -c` on your laptop.
2. **Build.** Change the SQL of `domains/orders/blocks/revenue-by-region.dql`,
   or add a block beside it with the same fields: `owner`, `description`,
   `pattern`, `grain`, `entities`, `outputs`, `sourceSystems`,
   `reviewCadence` and a `tests { assert … }` section. A certified block
   needs every one of them; `npx zlens certify <file> --enterprise --connection <duckdb file>`
   tells you which is missing.
3. **Mark it certified** (`status = "certified"`): a proposal, not a fact yet.
4. **Submit.** The draft space opens the pull request through the GitHub App;
   from a laptop, push and open it yourself. The `validate` workflow runs;
   the App posts the **DQL certification** check and ZLens starts a preview.
5. **Steward reviews.** A steward (not the author) opens the review, previews
   the change as a reader, and approves the exact commit. The check passes.
6. **Merge.** Branch protection lets it merge (or ZLens merges it, with
   *merge after approval* on). Production redeploys from `main`, and the
   answer is **Certified**, naming the block and its owner.

Metrics in `semantic-layer/metrics/*.yaml` take the same path:
`status: certified` on a merged file is what the install guide calls a
certified metric.

## Who may see what

**Row rules and column policies are not in this repository.** They are set in
the admin console (Admin → Row rules; Classification and Admin → Column
policies) and apply to every query a worker runs, Ask, notebooks and App
tiles alike, as the person asking. Nothing a creator commits here can widen
them. Roles come from your identity provider's groups (Admin → Roles).

**Who an App is for.** The template ships `apps/orders-weekly/dql.app.json`
**without** an `audienceGroups` key, so the install decides: the workspace's
roles and the App's own policies in the file say who may open it. Two ways to
narrow it to named groups:

- **An admin, at once:** Admin → Access policies → *Who may open each App*,
  choosing groups from your identity provider (or ZLens groups). The setting
  lives in ZLens Enterprise, not in this repository, and applies to everything
  done with the App (reading, running, exporting, following, asking about it);
  the App's owners and people given access still pass.
- **An author, through review:** add `"audienceGroups": ["<a real group name>"]`
  to `dql.app.json` in a draft space or branch and open a pull request. Once
  merged, the App opens only for members of those groups, its owners and people
  given access; others see "You don't have access" with **Request access**.
  Name groups that exist in your directory: a group nobody is in keeps
  everyone but the owners out.

## Never commit

- **Secrets.** Passwords, tokens, key files, `.env`. The connection reads
  `${ENV_VAR}` references; ZLens's notebook writes typed secrets to
  `.dql/local/private/connection-secrets.json`, which is git-ignored. A
  pull request that adds files under `.dql/local`, `.dql/connectors` or
  `node_modules` is refused a preview.
- **Personal and generated files.** `.dql/local/`, `.dql/cache/`,
  `dql-manifest.json`, `*.run.json`, `*.duckdb.wal` (all in `.gitignore`).
- **Warehouse files other than the sample.** `*.duckdb` is ignored except
  `sample/starter.duckdb`. Do not put real data in a DuckDB file here.
- **A connection change together with content.** `dql.config.json` is
  Production's; a pull request that changes connections gets no preview and
  takes effect only when merged. Keep it in its own pull request.

## Checklist

- [ ] `npm run validate` and `npm run doctor` pass locally
- [ ] `dql.config.json` points at your warehouse, password as `${ZLENS_WAREHOUSE_PASSWORD}`; the sample config is not committed over it
- [ ] The ZLens warehouse account is read-only
- [ ] `CODEOWNERS` names your stewards and admins
- [ ] `owner` in `domains/orders/domain.dql`, the blocks, the metrics and the App is a real person or team
- [ ] Decided who may open the Orders Weekly App: Admin → Access policies, or `audienceGroups` in `apps/orders-weekly/dql.app.json` through a pull request
- [ ] The admin registered the repository (`workspaces`) and the secret (`worker_warehouse_secrets`)
- [ ] The GitHub App is installed here and **DQL certification** is required on `main`
- [ ] The first question answered **Certified** in the install's step 6

## Layout rules

- One ZLens project at the repository root; the worker looks for
  `dql.config.json` there and nowhere else.
- Blocks live in `domains/<domain>/blocks/`; a draft space starts a new one
  under `domains/<domain>/blocks/_drafts/`.
- Dashboards (`.dqld`) bind to a Dataset by `sourceId` and `sourceRevision`
  (a hash of the Dataset's file). Editing a Dataset block changes its
  revision: reselect the Dataset's fields on the page in the Apps builder
  before publishing, or `zlens app build .` reports `APP_DATASET_SOURCE_DRIFT`.

## License

Apache-2.0. Copyright 2026 DuckCode AI Labs.
