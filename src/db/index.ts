import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export function createDb(dbPath: string = path.join(process.cwd(), 'data', 'comunia.db')) {
  if (dbPath !== ':memory:' && !dbPath.startsWith('file:')) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  // Run migrations — single source of truth from schema.ts
  migrate(db, { migrationsFolder })

  return db
}
