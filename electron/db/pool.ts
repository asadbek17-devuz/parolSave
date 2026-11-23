import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import { Pool } from 'pg'
import type * as pg from 'pg'
import { migrate } from './migrate'

const DATABASE_NAME = 'parolsave'
const CONFIG_FILE = 'db.json'
const PGDATA_DIR = 'pgdata'

type DbConfig = {
  port: number
  password: string
}

function isDbConfig(value: unknown): value is DbConfig {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<DbConfig>
  return (
    Number.isInteger(candidate.port) &&
    (candidate.port ?? 0) > 0 &&
    typeof candidate.password === 'string' &&
    candidate.password.length > 0
  )
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a local port')))
        return
      }
      const { port } = address
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function ensureDatabase(postgres: EmbeddedPostgres): Promise<void> {
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  try {
    await client.connect()
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DATABASE_NAME])
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(DATABASE_NAME)}`)
    }
  } finally {
    await client.end()
  }
}

export class Database {
  private pool?: pg.Pool
  private postgres?: EmbeddedPostgres

  async start(userDataDir: string): Promise<void> {
    if (this.pool) {
      return
    }

    await mkdir(userDataDir, { recursive: true })
    const config = await this.loadOrCreateConfig(userDataDir)
    const databaseDir = join(userDataDir, PGDATA_DIR)
    await mkdir(databaseDir, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') {
      await chmod(databaseDir, 0o700)
    }

    const postgres = new EmbeddedPostgres({
      databaseDir,
      port: config.port,
      user: 'postgres',
      password: config.password,
      authMethod: 'scram-sha-256',
      persistent: true,
      postgresFlags: [
        '-c',
        'listen_addresses=127.0.0.1',
        '-c',
        'fsync=on',
        '-c',
        'synchronous_commit=on',
        '-c',
        'wal_level=replica',
      ],
      onLog: () => {},
      onError: () => {},
    })
    this.postgres = postgres

    if (!(await fileExists(join(databaseDir, 'PG_VERSION')))) {
      await postgres.initialise()
    }
    await postgres.start()

    try {
      await ensureDatabase(postgres)
      const pool = new Pool({
        host: '127.0.0.1',
        port: config.port,
        user: 'postgres',
        password: config.password,
        database: DATABASE_NAME,
        max: 3,
      })
      pool.on('error', () => {})
      this.pool = pool
      await migrate(this)
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    const pool = this.pool
    this.pool = undefined
    if (pool) {
      await pool.end()
    }
    const postgres = this.postgres
    this.postgres = undefined
    if (postgres) {
      await postgres.stop()
    }
  }

  async query<T extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
    return this.requirePool().query<T>(sql, params)
  }

  async transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {}
      throw error
    } finally {
      client.release()
    }
  }

  private requirePool(): pg.Pool {
    if (!this.pool) {
      throw new Error('Database is not started')
    }
    return this.pool
  }

  private async loadOrCreateConfig(userDataDir: string): Promise<DbConfig> {
    const filePath = join(userDataDir, CONFIG_FILE)
    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isDbConfig(parsed)) {
        throw new Error('Invalid database configuration file')
      }
      await this.restrictPermissions(filePath)
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    const config: DbConfig = {
      port: await findFreePort(),
      password: randomBytes(24).toString('base64url'),
    }
    try {
      await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return this.loadOrCreateConfig(userDataDir)
      }
      throw error
    }
    await this.restrictPermissions(filePath)
    return config
  }

  private async restrictPermissions(filePath: string): Promise<void> {
    if (process.platform !== 'win32') {
      await chmod(filePath, 0o600)
    }
  }
}
