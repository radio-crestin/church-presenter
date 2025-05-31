import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

interface Migration {
  version: number;
  description: string;
  up: (db: sqlite3.Database) => Promise<void>;
}

// Enhanced normalization function for search with religious name variations
function normalizeForSearch(text: string): string {
  if (!text) return '';
  
  let normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim();
  
  // Handle common religious name variations and transliterations
  normalized = applyReligiousNameNormalization(normalized);
  
  return normalized;
}

// Apply religious name normalization rules
function applyReligiousNameNormalization(text: string): string {
  // Define normalization rules for religious terms
  const nameVariations: { [key: string]: string } = {
    // Christ variations
    'christos': 'hristos',
    'cristos': 'hristos',
    'khristos': 'hristos',
    'xristos': 'hristos',
    'christ': 'hrist',
    'crist': 'hrist',
    'khrist': 'hrist',
    'xrist': 'hrist',
    
    // Common Romanian/Greek religious terms
    'iisus': 'isus',
    'iesus': 'isus',
    'jesus': 'isus',
    'theotokos': 'teotokos',
    'fecioara': 'fecioara',
    'maica': 'maica',
    'maria': 'maria',
    'marie': 'maria',
    
    // Saint variations
    'sfantul': 'sfant',
    'sfanta': 'sfant',
    'sfintul': 'sfant',
    'sfinta': 'sfant',
    'saint': 'sfant',
    'sanctus': 'sfant',
    'sancta': 'sfant',
    
    // Common apostle/saint name variations
    'pavel': 'paul',
    'petru': 'petru',
    'peter': 'petru',
    'petre': 'petru',
    'ioan': 'ioan',
    'john': 'ioan',
    'iohannes': 'ioan',
    'gheorghe': 'gheorghe',
    'george': 'gheorghe',
    'georgios': 'gheorghe',
    
    // Church/religious building terms
    'biserica': 'biserica',
    'church': 'biserica',
    'basilica': 'basilica',
    'catedrala': 'catedrala',
    'cathedral': 'catedrala',
    'manastire': 'manastire',
    'monastery': 'manastire',
    'monasterio': 'manastire',
    
    // Religious feast/celebration terms
    'craciun': 'craciun',
    'christmas': 'craciun',
    'paste': 'paste',
    'easter': 'paste',
    'rusalii': 'rusalii',
    'pentecost': 'rusalii',
    'botez': 'botez',
    'baptism': 'botez',
    'botezul': 'botez',
    
    // Common religious concepts
    'invierea': 'inviere',
    'resurrection': 'inviere',
    'nasterea': 'nastere',
    'nativity': 'nastere',
    'buna': 'buna',
    'vestire': 'vestire',
    'annunciation': 'vestire',
    
    // Handle 'ch' vs 'h' vs 'c' at word boundaries
    'chr': 'hr',
    'ch': 'h',
  };
  
  // Apply word-level replacements
  let result = text;
  
  // Split into words and process each
  const words = result.split(/\s+/);
  const processedWords = words.map(word => {
    // Remove punctuation for matching
    const cleanWord = word.replace(/[^a-z0-9]/gi, '');
    
    // Check for exact matches first
    if (nameVariations[cleanWord]) {
      return word.replace(cleanWord, nameVariations[cleanWord]);
    }
    
    // Check for partial matches at word start
    for (const [variant, normalized] of Object.entries(nameVariations)) {
      if (cleanWord.startsWith(variant)) {
        return word.replace(variant, normalized);
      }
    }
    
    return word;
  });
  
  result = processedWords.join(' ');
  
  // Apply character-level transformations for remaining cases
  result = result
    // Handle Chr -> Hr at start of words
    .replace(/\bchr/g, 'hr')
    .replace(/\bChr/g, 'hr')
    // Handle common transliteration patterns
    .replace(/kh/g, 'h')    // Greek χ transliteration
    .replace(/th/g, 't')    // Greek θ transliteration (simplified)
    .replace(/ph/g, 'f')    // Greek φ transliteration
    .replace(/rh/g, 'r')    // Greek ρ transliteration
    // Handle Romanian ș/ț without diacritics
    .replace(/sh/g, 's')
    .replace(/ts/g, 't')
    .replace(/tz/g, 't');
  
  return result;
}

export interface PresentationData {
  title?: string;
  content?: string;
  path: string;
  fileSize?: number;
}

export interface Presentation {
  path: string;
  title: string;
  content: string | null;
  view_count: number | null;
  is_favorite: boolean | null;
  file_size: number | null;
  created_at: string | null;
  updated_at: string | null;
  last_accessed: string | null;
}

export interface SearchResult extends Presentation {
  title_snippet: string;
  content_snippet: string;
  relevance_score: number;
  match_type: 'exact' | 'fts';
  search_query: string;
  search_terms: string[];
}

export interface SearchOptions {
  searchInContent?: boolean; // Whether to search in content or just titles
  useBM25?: boolean; // Whether to use BM25/FTS5 search on normalized fields
  limit?: number;
}

class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private isInitialized = false;
  private operationQueue: Array<() => Promise<void>> = [];
  private processing = false;

  private migrations: Migration[] = [
    {
      version: 1,
      description: 'Initial schema',
      up: async (db: sqlite3.Database) => {
        return new Promise((resolve, reject) => {
          db.serialize(() => {
            db.run(`
              CREATE TABLE IF NOT EXISTS presentations (
                path TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT,
                view_count INTEGER DEFAULT 0,
                is_favorite INTEGER DEFAULT 0,
                file_size INTEGER,
                created_at TEXT,
                updated_at TEXT,
                last_accessed TEXT
              )
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
              )
            `, (err) => {
              if (err) return reject(err);
              resolve(undefined);
            });
          });
        });
      }
    },
    {
      version: 2,
      description: 'Add auto-incrementing ID column',
      up: async (db: sqlite3.Database) => {
        return new Promise((resolve, reject) => {
          db.serialize(() => {
            // Create new table with auto-incrementing ID
            db.run(`
              CREATE TABLE presentations_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                view_count INTEGER DEFAULT 0,
                is_favorite INTEGER DEFAULT 0,
                file_size INTEGER,
                created_at TEXT,
                updated_at TEXT,
                last_accessed TEXT
              )
            `, (err) => {
              if (err) return reject(err);
            });

            // Copy data from old table if it exists
            db.run(`
              INSERT INTO presentations_new (path, title, content, view_count, is_favorite, file_size, created_at, updated_at, last_accessed)
              SELECT path, title, content, view_count, is_favorite, file_size, created_at, updated_at, last_accessed
              FROM presentations
            `, (err) => {
              if (err) {
                console.log('No existing data to migrate:', err);
              }
            });

            // Drop old table and rename new one
            db.run('DROP TABLE IF EXISTS presentations', (err) => {
              if (err) return reject(err);
            });

            db.run('ALTER TABLE presentations_new RENAME TO presentations', (err) => {
              if (err) return reject(err);
              resolve(undefined);
            });
          });
        });
      }
    },
    {
      version: 3,
      description: 'Add FTS virtual table and normalized search columns',
      up: async (db: sqlite3.Database) => {
        return new Promise((resolve, reject) => {
          db.serialize(() => {
            // Add normalized columns for diacritic-free search
            db.run(`
              ALTER TABLE presentations 
              ADD COLUMN title_normalized TEXT
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) return reject(err);
            });

            db.run(`
              ALTER TABLE presentations 
              ADD COLUMN content_normalized TEXT
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) return reject(err);
            });

            // Create FTS virtual table with alphanumeric tokenization
            db.run(`
              CREATE VIRTUAL TABLE IF NOT EXISTS presentations_fts USING fts5(
                path UNINDEXED,
                title,
                content,
                title_alphanumeric,
                content_alphanumeric,
                tokenize='porter ascii',
                content='presentations',
                content_rowid='id'
              )
            `, (err) => {
              if (err) return reject(err);
            });

            // Create triggers to keep FTS in sync
            db.run(`
              CREATE TRIGGER IF NOT EXISTS presentations_fts_insert AFTER INSERT ON presentations BEGIN
                INSERT INTO presentations_fts(rowid, path, title, content, title_normalized, content_normalized)
                VALUES (new.id, new.path, new.title, new.content, new.title_normalized, new.content_normalized);
              END
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE TRIGGER IF NOT EXISTS presentations_fts_delete AFTER DELETE ON presentations BEGIN
                INSERT INTO presentations_fts(presentations_fts, rowid, path, title, content, title_normalized, content_normalized)
                VALUES ('delete', old.id, old.path, old.title, old.content, old.title_normalized, old.content_normalized);
              END
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE TRIGGER IF NOT EXISTS presentations_fts_update AFTER UPDATE ON presentations BEGIN
                INSERT INTO presentations_fts(presentations_fts, rowid, path, title, content, title_normalized, content_normalized)
                VALUES ('delete', old.id, old.path, old.title, old.content, old.title_normalized, old.content_normalized);
                INSERT INTO presentations_fts(rowid, path, title, content, title_normalized, content_normalized)
                VALUES (new.id, new.path, new.title, new.content, new.title_normalized, new.content_normalized);
              END
            `, (err) => {
              if (err) return reject(err);
              resolve(undefined);
            });
          });
        });
      }
    },
    {
      version: 4,
      description: 'Add alphanumeric search columns and rebuild FTS5 for optimized search',
      up: async (db: sqlite3.Database) => {
        return new Promise((resolve, reject) => {
          db.serialize(() => {
            // Add alphanumeric columns
            db.run(`
              ALTER TABLE presentations 
              ADD COLUMN title_alphanumeric TEXT
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) return reject(err);
            });

            db.run(`
              ALTER TABLE presentations 
              ADD COLUMN content_alphanumeric TEXT
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) return reject(err);
            });

            // Drop existing FTS table and recreate with new structure
            db.run('DROP TABLE IF EXISTS presentations_fts', (err) => {
              if (err) return reject(err);
            });

            // Drop existing triggers
            db.run('DROP TRIGGER IF EXISTS presentations_fts_insert', (err) => {
              if (err) return reject(err);
            });
            db.run('DROP TRIGGER IF EXISTS presentations_fts_delete', (err) => {
              if (err) return reject(err);
            });
            db.run('DROP TRIGGER IF EXISTS presentations_fts_update', (err) => {
              if (err) return reject(err);
            });

            // Create new FTS table with alphanumeric columns
            db.run(`
              CREATE VIRTUAL TABLE presentations_fts USING fts5(
                path UNINDEXED,
                title,
                content,
                title_alphanumeric,
                content_alphanumeric,
                tokenize='porter ascii',
                content='presentations',
                content_rowid='id'
              )
            `, (err) => {
              if (err) return reject(err);
            });

            // Create new triggers
            db.run(`
              CREATE TRIGGER presentations_fts_insert AFTER INSERT ON presentations BEGIN
                INSERT INTO presentations_fts(rowid, path, title, content, title_alphanumeric, content_alphanumeric)
                VALUES (new.id, new.path, new.title, new.content, new.title_alphanumeric, new.content_alphanumeric);
              END
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE TRIGGER presentations_fts_delete AFTER DELETE ON presentations BEGIN
                INSERT INTO presentations_fts(presentations_fts, rowid, path, title, content, title_alphanumeric, content_alphanumeric)
                VALUES ('delete', old.id, old.path, old.title, old.content, old.title_alphanumeric, old.content_alphanumeric);
              END
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE TRIGGER presentations_fts_update AFTER UPDATE ON presentations BEGIN
                INSERT INTO presentations_fts(presentations_fts, rowid, path, title, content, title_alphanumeric, content_alphanumeric)
                VALUES ('delete', old.id, old.path, old.title, old.content, old.title_alphanumeric, old.content_alphanumeric);
                INSERT INTO presentations_fts(rowid, path, title, content, title_alphanumeric, content_alphanumeric)
                VALUES (new.id, new.path, new.title, new.content, new.title_alphanumeric, new.content_alphanumeric);
              END
            `, (err) => {
              if (err) return reject(err);
              resolve(undefined);
            });
          });
        });
      }
    },
    {
      version: 5,
      description: 'Add categories and folders tables for organized directory management',
      up: async (db: sqlite3.Database) => {
        return new Promise((resolve, reject) => {
          db.serialize(() => {
            // Create categories table
            db.run(`
              CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              )
            `, (err) => {
              if (err) return reject(err);
            });

            // Create folders table
            db.run(`
              CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
              )
            `, (err) => {
              if (err) return reject(err);
            });

            // Create indexes for better performance
            db.run(`
              CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order_index)
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE INDEX IF NOT EXISTS idx_folders_category ON folders(category_id)
            `, (err) => {
              if (err) return reject(err);
            });

            db.run(`
              CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path)
            `, (err) => {
              if (err) return reject(err);
              resolve(undefined);
            });
          });
        });
      }
    }
  ];

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'presentations.db');

      console.log(`Initializing database at ${dbPath}`);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      let dbCorrupted = false;

      try {
        // Create SQLite database with optimizations for concurrent access
        this.db = new sqlite3.Database(dbPath);

        // Configure SQLite for better concurrent performance
        await this.configureSQLiteOptimizations();

        // Test if database is accessible
        await this.testDatabaseIntegrity();

        await this.createMigrationsTable();
        await this.runMigrations();
        await this.createIndexes();
      } catch (error: any) {
        if (error.message && error.message.includes('SQLITE_CORRUPT')) {
          console.warn('Database corruption detected, attempting recovery...');
          dbCorrupted = true;
        } else {
          throw error;
        }
      }

      // Handle database corruption
      if (dbCorrupted) {
        await this.recoverFromCorruption(dbPath);
      }

      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async configureSQLiteOptimizations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const optimizations = [
      // Performance and concurrency optimizations
      'PRAGMA journal_mode = WAL',           // Enable WAL mode for better concurrency
      'PRAGMA synchronous = NORMAL',         // Balance between safety and performance
      'PRAGMA wal_autocheckpoint = 1000',    // Auto-checkpoint every 1000 pages
      'PRAGMA journal_size_limit = 67108864', // Limit WAL file to 64MB

      // Memory optimizations - much larger cache for indexes and data
      'PRAGMA cache_size = -524288',         // Negative value = 512MB in KB (keeps indexes in RAM)
      'PRAGMA temp_store = memory',          // Store temp tables in memory
      'PRAGMA mmap_size = 2147483648',       // Enable 2GB memory mapping

      // Query and index optimizations
      'PRAGMA automatic_index = ON',         // Enable automatic indexes for optimization
      'PRAGMA optimize',                     // Optimize query planner and statistics
      'PRAGMA analysis_limit = 1000',        // Limit analysis for faster ANALYZE

      // Connection and timeout settings
      'PRAGMA busy_timeout = 30000',         // 30 second timeout for busy database
      'PRAGMA read_uncommitted = ON',        // Allow dirty reads for better performance

      // FTS5 specific optimizations
      'PRAGMA case_sensitive_like = OFF',    // Optimize LIKE operations
      'PRAGMA threads = 4'                   // Use multiple threads for operations
    ];

    for (const pragma of optimizations) {
      await new Promise<void>((resolve, reject) => {
        this.db!.run(pragma, (err) => {
          if (err) {
            console.warn(`Failed to apply optimization "${pragma}":`, err.message);
          }
          resolve(); // Continue even if some optimizations fail
        });
      });
    }

    // Run ANALYZE to update statistics for better query planning
    await new Promise<void>((resolve, reject) => {
      this.db!.run('ANALYZE', (err) => {
        if (err) {
          console.warn('Failed to run ANALYZE:', err.message);
        }
        resolve();
      });
    });

    console.log('SQLite performance optimizations applied (512MB cache, 2GB mmap)');
  }

  private async testDatabaseIntegrity(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.get('PRAGMA integrity_check', (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async recoverFromCorruption(dbPath: string): Promise<void> {
    console.log('Attempting to recover from database corruption...');

    try {
      // Close existing connection
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // Create backup of corrupted database
      const backupPath = `${dbPath}.corrupted.${Date.now()}`;
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
        console.log(`Corrupted database backed up to: ${backupPath}`);
      }

      // Delete corrupted database
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Corrupted database file removed');
      }

      // Create new database
      this.db = new sqlite3.Database(dbPath);
      console.log('New database created');

      // Run initialization steps
      await this.createMigrationsTable();
      await this.runMigrations();
      await this.createIndexes();

      console.log('Database recovery completed successfully');
    } catch (error) {
      console.error('Database recovery failed:', error);
      throw new Error(`Database recovery failed: ${(error as Error).message}`);
    }
  }

  private async createMigrationsTable(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get current migration version
    let currentVersion = 0;
    try {
      currentVersion = await new Promise<number>((resolve, reject) => {
        this.db!.get('SELECT MAX(version) as version FROM migrations', (err, row: any) => {
          if (err) reject(err);
          else resolve(row?.version || 0);
        });
      });
    } catch (error) {
      // Migrations table might not exist yet, that's ok
      console.log('No existing migrations found');
    }

    // Run pending migrations
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

    for (const migration of pendingMigrations) {
      console.log(`Running migration ${migration.version}: ${migration.description}`);

      try {
        await migration.up(this.db);

        // Record migration as applied
        await new Promise<void>((resolve, reject) => {
          this.db!.run(
            'INSERT INTO migrations (version, description, applied_at) VALUES (?, ?, ?)',
            [migration.version, migration.description, new Date().toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        console.log(`Migration ${migration.version} completed successfully`);
      } catch (error) {
        console.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const indexes = [
      // Primary lookup indexes (most frequently used)
      'CREATE INDEX IF NOT EXISTS idx_presentations_path ON presentations(path)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_id_path ON presentations(id, path)',

      // Search-optimized indexes (kept in memory cache)
      'CREATE INDEX IF NOT EXISTS idx_presentations_title_search ON presentations(title COLLATE NOCASE)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_title_normalized_search ON presentations(title_normalized COLLATE NOCASE)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_title_alphanumeric ON presentations(title_alphanumeric)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_content_alphanumeric ON presentations(content_alphanumeric)',

      // Content search indexes (partial indexes for performance)
      'CREATE INDEX IF NOT EXISTS idx_presentations_content_search ON presentations(content) WHERE content IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_presentations_content_normalized ON presentations(content_normalized) WHERE content_normalized IS NOT NULL',

      // Filtering and sorting indexes
      'CREATE INDEX IF NOT EXISTS idx_presentations_favorite_updated ON presentations(is_favorite DESC, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_view_count_desc ON presentations(view_count DESC, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_updated_desc ON presentations(updated_at DESC)',

      // Compound indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_presentations_search_combo ON presentations(title, title_normalized, is_favorite, view_count)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_stats_combo ON presentations(view_count DESC, is_favorite DESC, updated_at DESC)',

      // Covering indexes for fast queries (includes all needed columns)
      'CREATE INDEX IF NOT EXISTS idx_presentations_list_cover ON presentations(updated_at DESC, id, path, title, view_count, is_favorite)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_search_cover ON presentations(title, title_normalized, id, path, view_count, is_favorite, updated_at)',

      // Category and folder indexes
      'CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order_index ASC, name ASC)',
      'CREATE INDEX IF NOT EXISTS idx_folders_category ON folders(category_id, id)',
      'CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path)',

      // Settings index
      'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)'
    ];

    let indexCount = 0;
    for (const indexSQL of indexes) {
      await new Promise<void>((resolve, reject) => {
        this.db!.run(indexSQL, (err) => {
          if (err) {
            console.warn(`Failed to create index: ${indexSQL}`, err.message);
          } else {
            indexCount++;
          }
          resolve(); // Continue even if some indexes fail
        });
      });
    }

    console.log(`Created ${indexCount} optimized indexes for fast search and retrieval`);
  }

  async insertOrUpdatePresentation(presentationData: PresentationData): Promise<{ id: string; changes: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const { title, content, path: filePath, fileSize } = presentationData;
    const now = new Date().toISOString();

    // Validate required parameters
    const safeTitle = title || 'Untitled Presentation';
    const safeContent = content || '';
    const safeFilePath = filePath || '';
    const safeFileSize = fileSize || 0;

    if (!safeFilePath) {
      throw new Error('File path is required');
    }

    // Create normalized versions for better search
    const titleNormalized = normalizeForSearch(safeTitle);
    const contentNormalized = normalizeForSearch(safeContent);

    // Use SQLite upsert syntax with normalized fields
    try {
      await new Promise<void>((resolve, reject) => {
        this.db!.run(
          `INSERT INTO presentations (path, title, content, file_size, created_at, updated_at, title_normalized, content_normalized)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (path) DO UPDATE SET 
             title = EXCLUDED.title,
             content = EXCLUDED.content,
             file_size = EXCLUDED.file_size,
             updated_at = EXCLUDED.updated_at,
             title_normalized = EXCLUDED.title_normalized,
             content_normalized = EXCLUDED.content_normalized`,
          [safeFilePath, safeTitle, safeContent, safeFileSize, now, now, titleNormalized, contentNormalized],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error: any) {
      if (error.message && error.message.includes('SQLITE_CORRUPT')) {
        console.error('Database corruption detected during insert/update operation');
        throw new Error('Database corruption detected. Please restart the application to recover.');
      }
      throw error;
    }

    return { id: safeFilePath, changes: 1 };
  }

  private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.operationQueue.length === 0) return;

    this.processing = true;

    try {
      while (this.operationQueue.length > 0) {
        const operation = this.operationQueue.shift();
        if (operation) {
          await operation();
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async insertOrUpdatePresentationBatch(presentations: PresentationData[]): Promise<number> {
    return this.queueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      if (presentations.length === 0) return 0;

      try {
        const now = new Date().toISOString();

        // Begin transaction for batch insert
        await new Promise<void>((resolve, reject) => {
          this.db!.run('BEGIN TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        const stmt = this.db.prepare(`
          INSERT INTO presentations (path, title, content, file_size, created_at, updated_at, title_normalized, content_normalized)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (path) DO UPDATE SET 
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            file_size = EXCLUDED.file_size,
            updated_at = EXCLUDED.updated_at,
            title_normalized = EXCLUDED.title_normalized,
            content_normalized = EXCLUDED.content_normalized
        `);

        let processed = 0;

        for (const presentationData of presentations) {
          const { title, content, path: filePath, fileSize } = presentationData;

          // Validate required parameters
          const safeTitle = title || 'Untitled Presentation';
          const safeContent = content || '';
          const safeFilePath = filePath || '';
          const safeFileSize = fileSize || 0;

          if (!safeFilePath) {
            console.warn('Skipping presentation with empty path');
            continue;
          }

          // Create normalized versions for better search
          const titleNormalized = normalizeForSearch(safeTitle);
          const contentNormalized = normalizeForSearch(safeContent);

          await new Promise<void>((resolve, reject) => {
            stmt.run(
              [safeFilePath, safeTitle, safeContent, safeFileSize, now, now, titleNormalized, contentNormalized],
              (err) => {
                if (err) reject(err);
                else {
                  processed++;
                  resolve();
                }
              }
            );
          });
        }

        stmt.finalize();

        // Commit transaction
        await new Promise<void>((resolve, reject) => {
          this.db!.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`Batch inserted/updated ${processed} presentations`);
        return processed;

      } catch (error: any) {
        // Rollback on error
        try {
          await new Promise<void>((resolve, reject) => {
            this.db!.run('ROLLBACK', (err) => {
              resolve(); // Don't reject on rollback errors
            });
          });
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }

        if (error.message && error.message.includes('SQLITE_CORRUPT')) {
          console.error('Database corruption detected during batch insert operation');
          throw new Error('Database corruption detected. Please restart the application to recover.');
        }
        throw error;
      }
    });
  }

  async recoverDatabase(): Promise<boolean> {
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'presentations.db');

      console.log('Manual database recovery initiated');

      // Reset initialization state
      this.isInitialized = false;

      // Run recovery
      await this.recoverFromCorruption(dbPath);

      this.isInitialized = true;
      console.log('Manual database recovery completed');

      return true;
    } catch (error) {
      console.error('Manual database recovery failed:', error);
      return false;
    }
  }

  async searchPresentations(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const { searchInContent = true, limit = 50 } = options;
    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      return [];
    }

    console.log(`Searching for "${trimmedQuery}" (searchInContent: ${searchInContent})`);

    // Normalize the search query for better matching
    const normalizedQuery = normalizeForSearch(trimmedQuery);

    return this.performBM25Search(normalizedQuery, searchInContent, limit);
  }

  private async performBM25Search(normalizedQuery: string, searchInContent: boolean, limit: number): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Create FTS5 query - search only in normalized fields
    const terms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) return [];

    // Build FTS query for normalized fields
    const ftsQuery = terms.map(term => `"${term}"`).join(' AND ');

    const sql = searchInContent ? `
      SELECT p.id, p.path, p.title, p.content, p.view_count, p.is_favorite, p.file_size,
             p.created_at, p.updated_at, p.last_accessed,
             bm25(presentations_fts, 1.0, 10.0, 1.0, 1.0, 1.0) as bm25_score
      FROM presentations_fts
      JOIN presentations p ON presentations_fts.rowid = p.id
      WHERE presentations_fts MATCH ?
      ORDER BY 
        bm25_score ASC,
        p.is_favorite DESC,
        p.view_count DESC,
        p.updated_at DESC
      LIMIT ?
    ` : `
      SELECT p.id, p.path, p.title, p.content, p.view_count, p.is_favorite, p.file_size,
             p.created_at, p.updated_at, p.last_accessed,
             bm25(presentations_fts, 1.0, 10.0, 0.0, 0.0, 0.0) as bm25_score
      FROM presentations_fts
      JOIN presentations p ON presentations_fts.rowid = p.id
      WHERE presentations_fts MATCH ?
      ORDER BY 
        bm25_score ASC,
        p.is_favorite DESC,
        p.view_count DESC,
        p.updated_at DESC
      LIMIT ?
    `;

    const params = [ftsQuery, limit];

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows: any[]) => {
        if (err) {
          console.error('BM25 search failed:', err);
          reject(err);
        } else {
          const results = rows.map((row, index) => {
            const result = this.mapToSearchResult(row, normalizedQuery, 'fts');
            // BM25 score (lower is better, so invert it)
            let score = Math.max(0, 1000 + (row.bm25_score || 0));
            if (row.is_favorite) {
              score += 100;
            }
            score += Math.min(row.view_count || 0, 50);
            result.relevance_score = score;
            return result;
          });
          console.log(`Found ${results.length} results using BM25`);
          resolve(results);
        }
      });
    });
  }

  private mapToSearchResult(row: any, query: string, matchType: 'exact' | 'fts'): SearchResult {
    // Create snippet with highlighted matches
    const titleSnippet = this.createSnippet(row.title || '', query, 100);
    const contentSnippet = this.createSnippet(row.content || '', query, 200);
    
    // Extract search terms from the query
    const searchTerms = query.split(/\s+/).filter(term => term.length > 0);

    return {
      path: row.path,
      title: row.title,
      content: row.content,
      view_count: row.view_count,
      is_favorite: !!row.is_favorite,
      file_size: row.file_size,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_accessed: row.last_accessed,
      title_snippet: titleSnippet,
      content_snippet: contentSnippet,
      relevance_score: 0, // Will be set by caller
      match_type: matchType,
      search_query: query,
      search_terms: searchTerms
    };
  }

  private createSnippet(text: string, query: string, maxLength: number): string {
    if (!text || !query) return text?.substr(0, maxLength) || '';

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryIndex = lowerText.indexOf(lowerQuery);

    if (queryIndex === -1) {
      // No exact match found, just truncate
      return text.length > maxLength ? text.substr(0, maxLength - 3) + '...' : text;
    }

    // Try to center the snippet around the match
    const start = Math.max(0, queryIndex - Math.floor((maxLength - query.length) / 2));
    const end = Math.min(text.length, start + maxLength);

    let snippet = text.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }

  async getAllPresentations(orderBy = 'score DESC', limit = 100): Promise<Presentation[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Parse orderBy string
    const [column, direction] = orderBy.split(' ');
    let safeColumn: string;
    let orderClause: string;

    if (column === 'score') {
      // Calculate a relevance score based on view count, favorites, and recency
      orderClause = `view_count ${direction?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'}, is_favorite DESC, updated_at DESC`;
    } else {
      const validColumns = ['updated_at', 'created_at', 'title', 'view_count'];
      safeColumn = validColumns.includes(column) ? column : 'updated_at';
      const safeDirection = direction?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      orderClause = `${safeColumn} ${safeDirection}`;
    }

    const sql = `
      SELECT id, path, title, content, view_count, is_favorite, file_size,
             created_at, updated_at, last_accessed
      FROM presentations 
      ORDER BY ${orderClause}
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const results = rows.map(row => ({
            path: row.path,
            title: row.title,
            content: row.content,
            view_count: row.view_count,
            is_favorite: !!row.is_favorite,
            file_size: row.file_size,
            created_at: row.created_at,
            updated_at: row.updated_at,
            last_accessed: row.last_accessed,
          }));
          resolve(results);
        }
      });
    });
  }

  async updateViewCount(path: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db!.run(
        `UPDATE presentations 
         SET view_count = view_count + 1, last_accessed = ?
         WHERE path = ?`,
        [now, path],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async toggleFavorite(path: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    // First get the current favorite status
    const currentStatus = await new Promise<boolean>((resolve, reject) => {
      this.db!.get(
        'SELECT is_favorite FROM presentations WHERE path = ?',
        [path],
        (err, row: any) => {
          if (err) reject(err);
          else resolve(!!row?.is_favorite);
        }
      );
    });

    // Toggle the status
    const newStatus = !currentStatus;
    
    return new Promise((resolve, reject) => {
      this.db!.run(
        `UPDATE presentations 
         SET is_favorite = ?
         WHERE path = ?`,
        [newStatus ? 1 : 0, path],
        function(err) {
          if (err) reject(err);
          else resolve(newStatus ? 1 : 0);
        }
      );
    });
  }

  async removePresentation(path: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.run(
        'DELETE FROM presentations WHERE path = ?',
        [path],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async removePresentationsByPathPrefix(pathPrefix: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.run(
        'DELETE FROM presentations WHERE path LIKE ?',
        [pathPrefix + '%'],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async removePresentationsByFolderPath(folderPath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    // Normalize the folder path to ensure consistent matching
    const normalizedPath = folderPath.replace(/\\/g, '/').replace(/\/$/, '');
    const pathPattern = normalizedPath + '/%';

    return new Promise((resolve, reject) => {
      this.db!.run(
        'DELETE FROM presentations WHERE path LIKE ? OR path LIKE ?',
        [pathPattern, normalizedPath.replace(/\//g, '\\') + '\\%'],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.get(
        'SELECT value FROM settings WHERE key = ?',
        [key],
        (err, row: any) => {
          if (err) reject(err);
          else resolve(row?.value || null);
        }
      );
    });
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Category management methods
  async getCategories(): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // First get all categories
    const categoriesSql = `
      SELECT * FROM categories
      ORDER BY order_index ASC, name ASC
    `;

    const categories = await new Promise<any[]>((resolve, reject) => {
      this.db!.all(categoriesSql, [], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Then get folders for each category
    for (const category of categories) {
      const foldersSql = `
        SELECT id, path, name FROM folders
        WHERE category_id = ?
        ORDER BY id ASC
      `;

      const folders = await new Promise<any[]>((resolve, reject) => {
        this.db!.all(foldersSql, [category.id], (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      category.folders = folders;
      category.folder_count = folders.length;
      category.folder_paths = folders.map(f => f.path);
    }

    return categories;
  }

  async createCategory(name: string, orderIndex: number = 0): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db!.run(
        'INSERT INTO categories (name, order_index, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [name, orderIndex, now, now],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async updateCategory(id: number, name?: string, orderIndex?: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      params.push(orderIndex);
    }

    if (updates.length === 0) {
      return 0;
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`;

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async deleteCategory(id: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Begin transaction for atomic operations
      await new Promise<void>((resolve, reject) => {
        this.db!.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // First, get all folder paths for this category to clean up presentations
      const folderPaths = await new Promise<string[]>((resolve, reject) => {
        this.db!.all(
          'SELECT path FROM folders WHERE category_id = ?',
          [id],
          (err, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.path));
          }
        );
      });

      // Remove all presentations from these folders
      let totalPresentationsRemoved = 0;
      for (const folderPath of folderPaths) {
        const removed = await this.removePresentationsByFolderPath(folderPath);
        totalPresentationsRemoved += removed;
        console.log(`Removed ${removed} presentations from folder: ${folderPath}`);
      }

      // Delete the category (this will cascade delete folders due to foreign key constraint)
      const categoryChanges = await new Promise<number>((resolve, reject) => {
        this.db!.run(
          'DELETE FROM categories WHERE id = ?',
          [id],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      // Commit transaction
      await new Promise<void>((resolve, reject) => {
        this.db!.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`Deleted category and ${totalPresentationsRemoved} associated presentations`);
      return categoryChanges;

    } catch (error) {
      // Rollback on error
      try {
        await new Promise<void>((resolve, reject) => {
          this.db!.run('ROLLBACK', (err) => {
            resolve(); // Don't reject on rollback errors
          });
        });
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      throw error;
    }
  }

  async addFolderToCategory(categoryId: number, path: string, name?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const folderName = name || path.split('/').pop() || path;
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db!.run(
        'INSERT INTO folders (category_id, path, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [categoryId, path, folderName, now, now],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async removeFolderFromCategory(folderId: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Begin transaction for atomic operations
      await new Promise<void>((resolve, reject) => {
        this.db!.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // First, get the folder path to clean up presentations
      const folderPath = await new Promise<string | null>((resolve, reject) => {
        this.db!.get(
          'SELECT path FROM folders WHERE id = ?',
          [folderId],
          (err, row: any) => {
            if (err) reject(err);
            else resolve(row?.path || null);
          }
        );
      });

      if (folderPath) {
        // Remove all presentations from this folder
        const presentationsRemoved = await this.removePresentationsByFolderPath(folderPath);
        console.log(`Removed ${presentationsRemoved} presentations from folder: ${folderPath}`);
      }

      // Delete the folder
      const folderChanges = await new Promise<number>((resolve, reject) => {
        this.db!.run(
          'DELETE FROM folders WHERE id = ?',
          [folderId],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      // Commit transaction
      await new Promise<void>((resolve, reject) => {
        this.db!.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return folderChanges;

    } catch (error) {
      // Rollback on error
      try {
        await new Promise<void>((resolve, reject) => {
          this.db!.run('ROLLBACK', (err) => {
            resolve(); // Don't reject on rollback errors
          });
        });
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      throw error;
    }
  }

  async getAllFolderPaths(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT path FROM folders ORDER BY category_id, id';

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.path));
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
    this.isInitialized = false;
  }
}

export const database = new DatabaseManager();
export default database;
