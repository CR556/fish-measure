import * as SQLite from 'expo-sqlite';

const DB_NAME = 'fishmeasure.db';
export const SCHEMA_VERSION = 1;

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Opens (once) and migrates the catch database. WAL for concurrent reads
 * while writing; user_version drives forward-only migrations.
 */
export function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync(DB_NAME);
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(database: SQLite.SQLiteDatabase) {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    database.execSync(`
      CREATE TABLE IF NOT EXISTS catches (
        id TEXT PRIMARY KEY NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        measure_mode TEXT NOT NULL CHECK (measure_mode IN ('auto','manual')),
        length_curved_m REAL NOT NULL,
        length_chord_m REAL NOT NULL,
        length_source TEXT NOT NULL DEFAULT 'auto',
        girth_m REAL,
        girth_source TEXT,
        weight_kg REAL,
        weight_source TEXT,
        weight_formula TEXT,
        measure_confidence REAL,
        distance_m REAL,
        depth_coverage REAL,
        species_id TEXT,
        species_confidence REAL,
        species_source TEXT NOT NULL DEFAULT 'none',
        ai_suggestions TEXT,
        user_corrected INTEGER NOT NULL DEFAULT 0,
        bait TEXT,
        bait_source TEXT,
        lat REAL,
        lon REAL,
        loc_accuracy_m REAL,
        photo_path TEXT NOT NULL,
        thumb_path TEXT NOT NULL,
        ply_path TEXT,
        mask_path TEXT,
        contour_json_path TEXT,
        notes TEXT NOT NULL DEFAULT '',
        units_at_capture TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_catches_created ON catches(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_catches_species ON catches(species_id);
      CREATE INDEX IF NOT EXISTS idx_catches_length ON catches(length_curved_m);
      CREATE INDEX IF NOT EXISTS idx_catches_weight ON catches(weight_kg);

      CREATE TABLE IF NOT EXISTS id_queue (
        catch_id TEXT PRIMARY KEY NOT NULL REFERENCES catches(id) ON DELETE CASCADE,
        enqueued_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        last_error TEXT
      );
    `);
    database.execSync(`PRAGMA user_version = 1;`);
  }

  // Future migrations: `if (current < 2) { … PRAGMA user_version = 2; }`
}
