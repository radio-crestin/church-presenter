import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

interface Migration {
  version: number;
  description: string;
  up: (db: sqlite3.Database) => Promise<void>;
}

// Helper function to remove diacritics
function removeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Helper function for fuzzy matching (Levenshtein distance)
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Helper function to calculate similarity score (0-1)
function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return (maxLength - distance) / maxLength;
}

// Helper function to calculate word-order independent scoring
function calculateWordScore(searchTerms: string[], text: string, normalized: boolean = false): number {
  if (!text || searchTerms.length === 0) return 0;
  
  const textToCheck = normalized ? removeDiacritics(text.toLowerCase()) : text.toLowerCase();
  const words = textToCheck.split(/\s+/);
  
  let score = 0;
  let matchedTerms = 0;
  
  for (const term of searchTerms) {
    const termToCheck = normalized ? removeDiacritics(term.toLowerCase()) : term.toLowerCase();
    
    // Exact word match (highest score)
    if (words.some(word => word === termToCheck)) {
      score += 100;
      matchedTerms++;
      continue;
    }
    
    // Substring match in any word
    if (words.some(word => word.includes(termToCheck))) {
      score += 75;
      matchedTerms++;
      continue;
    }
    
    // Fuzzy match for longer terms
    if (termToCheck.length >= 3) {
      for (const word of words) {
        if (word.length >= 3) {
          const similarity = calculateSimilarity(termToCheck, word);
          if (similarity >= 0.7) {
            score += similarity * 50;
            matchedTerms++;
            break;
          }
        }
      }
    }
  }
  
  // Bonus for matching more terms
  const termCoverage = matchedTerms / searchTerms.length;
  score *= (0.5 + termCoverage * 0.5);
  
  return score;
}


// Helper function to calculate comprehensive search score
function calculateSearchScore(searchTerms: string[], presentation: any, includeContent: boolean = true): number {
  let totalScore = 0;
  
  // Title scoring (highest weight)
  const titleScore = calculateWordScore(searchTerms, presentation.title || '');
  const titleNormScore = calculateWordScore(searchTerms, presentation.title_normalized || '', true);
  totalScore += Math.max(titleScore, titleNormScore) * 3;
  
  // Content scoring (medium weight) - only if includeContent is true
  if (includeContent) {
    const contentScore = calculateWordScore(searchTerms, presentation.content || '');
    const contentNormScore = calculateWordScore(searchTerms, presentation.content_normalized || '', true);
    totalScore += Math.max(contentScore, contentNormScore) * 1;
  }
  
  // Popularity bonus (view count and favorites)
  const viewBonus = Math.min((presentation.view_count || 0) * 2, 50);
  const favoriteBonus = presentation.is_favorite ? 25 : 0;
  totalScore += viewBonus + favoriteBonus;
  
  // Recency bonus
  if (presentation.updated_at) {
    const daysSinceUpdate = (Date.now() - new Date(presentation.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 20 - daysSinceUpdate);
    totalScore += recencyBonus;
  }
  
  return totalScore;
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
  match_type: 'exact' | 'fuzzy' | 'fts' | 'smart';
}

export interface SearchOptions {
  fuzzyThreshold?: number; // 0-1, minimum similarity for fuzzy matches
  includeFuzzy?: boolean;
  includeFTS?: boolean;
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
            
            // Create FTS virtual table
            db.run(`
              CREATE VIRTUAL TABLE IF NOT EXISTS presentations_fts USING fts5(
                path UNINDEXED,
                title,
                content,
                title_normalized,
                content_normalized,
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
      'PRAGMA journal_mode = WAL',         // Enable WAL mode for better concurrency
      'PRAGMA synchronous = NORMAL',       // Balance between safety and performance
      'PRAGMA cache_size = 262144',        // Increase cache size to 1GB (262144 pages * 4KB)
      'PRAGMA temp_store = memory',        // Store temp tables in memory
      'PRAGMA mmap_size = 1073741824',     // Enable memory mapping (1GB)
      'PRAGMA busy_timeout = 30000',       // 30 second timeout for busy database
      'PRAGMA optimize'                    // Optimize query planner
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

    console.log('SQLite optimizations applied');
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
      'CREATE INDEX IF NOT EXISTS idx_presentations_path ON presentations(path)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_favorite ON presentations(is_favorite)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_title ON presentations(title)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_title_normalized ON presentations(title_normalized)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_content_normalized ON presentations(content_normalized)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_updated ON presentations(updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_view_count ON presentations(view_count)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_compound_search ON presentations(title, content, title_normalized, content_normalized)',
      'CREATE INDEX IF NOT EXISTS idx_presentations_compound_stats ON presentations(view_count, is_favorite, updated_at)'
    ];

    for (const indexSQL of indexes) {
      await new Promise<void>((resolve, reject) => {
        this.db!.run(indexSQL, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
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

    // Create normalized versions for diacritic-free search
    const titleNormalized = removeDiacritics(safeTitle);
    const contentNormalized = removeDiacritics(safeContent);

    // Use SQLite upsert syntax
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

          // Create normalized versions for diacritic-free search
          const titleNormalized = removeDiacritics(safeTitle);
          const contentNormalized = removeDiacritics(safeContent);

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

    const {
      fuzzyThreshold = 0.6,
      includeFuzzy = true,
      includeFTS = true,
      limit = 50
    } = options;

    // Parse search query into terms for word-order independent search
    const searchTerms = query.trim().toLowerCase().split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) {
      return [];
    }

    // Get all presentations and score them
    const allPresentations = await this.getAllPresentationsForSearch();
    const scoredResults: SearchResult[] = [];

    for (const presentation of allPresentations) {
      const score = calculateSearchScore(searchTerms, presentation, includeFTS);
      
      // Only include results with meaningful scores
      if (score > 10) {
        const result = this.mapToSearchResult(presentation, query, 'smart');
        result.relevance_score = Math.round(score);
        scoredResults.push(result);
      }
    }

    // Sort by relevance score (highest first) and limit results
    return scoredResults
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit);
  }

  private async getAllPresentationsForSearch(): Promise<any[]> {
    const sql = `
      SELECT id, path, title, content, view_count, is_favorite, file_size,
             created_at, updated_at, last_accessed, title_normalized, content_normalized
      FROM presentations
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  private async performExactSearch(query: string, normalizedQuery: string): Promise<SearchResult[]> {
    const searchPattern = `%${query}%`;
    const normalizedPattern = `%${normalizedQuery}%`;

    const sql = `
      SELECT id, path, title, content, view_count, is_favorite, file_size,
             created_at, updated_at, last_accessed, title_normalized, content_normalized
      FROM presentations 
      WHERE title LIKE ? OR content LIKE ? OR title_normalized LIKE ? OR content_normalized LIKE ?
      ORDER BY 
        CASE 
          WHEN title LIKE ? THEN 100
          WHEN title_normalized LIKE ? THEN 95
          WHEN content LIKE ? THEN 90
          WHEN content_normalized LIKE ? THEN 85
          ELSE 80
        END DESC,
        updated_at DESC
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [
        searchPattern, searchPattern, normalizedPattern, normalizedPattern,
        searchPattern, normalizedPattern, searchPattern, normalizedPattern
      ], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const results = rows.map(row => this.mapToSearchResult(row, query, 'exact'));
          resolve(results);
        }
      });
    });
  }

  private async performFTSSearch(query: string): Promise<SearchResult[]> {
    // Use FTS5 MATCH syntax for full-text search
    const ftsQuery = query.split(' ').map(term => `"${term}"`).join(' OR ');

    const sql = `
      SELECT p.id, p.path, p.title, p.content, p.view_count, p.is_favorite, p.file_size,
             p.created_at, p.updated_at, p.last_accessed, p.title_normalized, p.content_normalized,
             rank
      FROM presentations_fts f
      JOIN presentations p ON f.rowid = p.id
      WHERE presentations_fts MATCH ?
      ORDER BY rank
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [ftsQuery], (err, rows: any[]) => {
        if (err) {
          // FTS might not be available or query might be invalid
          console.log('FTS search failed:', err);
          resolve([]);
        } else {
          const results = rows.map(row => this.mapToSearchResult(row, query, 'fts'));
          resolve(results);
        }
      });
    });
  }

  private async performFuzzySearch(query: string, threshold: number): Promise<SearchResult[]> {
    const sql = `
      SELECT id, path, title, content, view_count, is_favorite, file_size,
             created_at, updated_at, last_accessed, title_normalized, content_normalized
      FROM presentations
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const results: SearchResult[] = [];
          const queryLower = query.toLowerCase();

          for (const row of rows) {
            let maxSimilarity = 0;
            let matchType: 'exact' | 'fuzzy' | 'fts' = 'fuzzy';

            // Check similarity with title
            const titleSimilarity = calculateSimilarity(queryLower, row.title?.toLowerCase() || '');
            maxSimilarity = Math.max(maxSimilarity, titleSimilarity);

            // Check similarity with normalized title
            const titleNormSimilarity = calculateSimilarity(queryLower, row.title_normalized?.toLowerCase() || '');
            maxSimilarity = Math.max(maxSimilarity, titleNormSimilarity);

            // For content, check against words to avoid very long comparisons
            if (row.content) {
              const contentWords = row.content.toLowerCase().split(/\s+/);
              const contentNormWords = (row.content_normalized || '').toLowerCase().split(/\s+/);
              
              for (const word of contentWords) {
                if (word.length >= 3) {
                  const wordSimilarity = calculateSimilarity(queryLower, word);
                  maxSimilarity = Math.max(maxSimilarity, wordSimilarity * 0.8); // Lower weight for content
                }
              }
              
              for (const word of contentNormWords) {
                if (word.length >= 3) {
                  const wordSimilarity = calculateSimilarity(queryLower, word);
                  maxSimilarity = Math.max(maxSimilarity, wordSimilarity * 0.75); // Lower weight for normalized content
                }
              }
            }

            if (maxSimilarity >= threshold) {
              const result = this.mapToSearchResult(row, query, matchType);
              result.relevance_score = maxSimilarity * 60; // Scale fuzzy scores lower than exact matches
              results.push(result);
            }
          }

          resolve(results);
        }
      });
    });
  }

  private mapToSearchResult(row: any, query: string, matchType: 'exact' | 'fuzzy' | 'fts' | 'smart'): SearchResult {
    // Create snippet with highlighted matches
    const titleSnippet = this.createSnippet(row.title || '', query, 100);
    const contentSnippet = this.createSnippet(row.content || '', query, 200);

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
      match_type: matchType
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

    return new Promise((resolve, reject) => {
      this.db!.run(
        `UPDATE presentations 
         SET is_favorite = NOT is_favorite
         WHERE path = ?`,
        [path],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
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

    return new Promise((resolve, reject) => {
      this.db!.run(
        'DELETE FROM categories WHERE id = ?',
        [id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
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

    return new Promise((resolve, reject) => {
      this.db!.run(
        'DELETE FROM folders WHERE id = ?',
        [folderId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
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
