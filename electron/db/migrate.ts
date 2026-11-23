import type { Database } from './pool'

const SCHEMA_VERSION = '1'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id         uuid PRIMARY KEY,
  payload    bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at DESC);
`

export async function migrate(db: Database): Promise<void> {
  await db.transaction(async (client) => {
    await client.query(SCHEMA_SQL)
    await client.query(
      `INSERT INTO meta (key, value) VALUES ('schema_version', $1)
       ON CONFLICT (key) DO NOTHING`,
      [SCHEMA_VERSION],
    )
  })
}
