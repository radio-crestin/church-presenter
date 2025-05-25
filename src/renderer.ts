// Renderer process script for Church Presenter

interface ElectronAPI {
  searchPresentations: (query: string, options?: any) => Promise<any[]>;
  getAllPresentations: (orderBy?: string, limit?: number) => Promise<any[]>;
  updateViewCount: (path: string) => Promise<number>;
  toggleFavorite: (path: string) => Promise<number>;
  openPresentation: (path: string) => Promise<{ success: boolean }>;
  getWatchDirectories: () => Promise<any[]>;
  setWatchDirectories: (directories: any[]) => Promise<boolean>;
  performFullSync: () => Promise<{ total: number; processed: number }>;
  getSyncStatus: () => Promise<{ inProgress: boolean; watchedDirectories: string[]; isInitialized: boolean }>;
  recoverDatabase: () => Promise<boolean>;
  onSyncProgress: (callback: (progress: any) => void) => void;
  removeAllListeners: (channel: string) => void;
}

// Extend Window interface
interface Window {
  electronAPI: ElectronAPI;
}

// State management
let currentPresentations: any[] = [];
let currentTab = 'presentations';
let showFavoritesOnly = false;

// DOM Elements (will be initialized after DOM loads)
let presentationsTab: HTMLButtonElement;
let settingsTab: HTMLButtonElement;
let presentationsContent: HTMLDivElement;
let settingsContent: HTMLDivElement;
let searchInput: HTMLInputElement;
let searchBtn: HTMLButtonElement;
let sortSelect: HTMLSelectElement;
let favoritesFilter: HTMLButtonElement;
let presentationsList: HTMLDivElement;
let directoriesList: HTMLDivElement;
let newDirectoryInput: HTMLInputElement;
let addDirectoryBtn: HTMLButtonElement;
let syncBtn: HTMLButtonElement;
let syncProgress: HTMLDivElement;
let progressFill: HTMLDivElement;
let progressText: HTMLDivElement;
let syncStatus: HTMLDivElement;
let recoverDbBtn: HTMLButtonElement;
let recoveryStatus: HTMLDivElement;

// Initialize DOM elements and event listeners after DOM loads
function initializeApp() {
  try {
    // Get DOM elements with error checking
    presentationsTab = document.getElementById('presentations-tab') as HTMLButtonElement;
    settingsTab = document.getElementById('settings-tab') as HTMLButtonElement;
    presentationsContent = document.getElementById('presentations-content') as HTMLDivElement;
    settingsContent = document.getElementById('settings-content') as HTMLDivElement;
    searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
    sortSelect = document.getElementById('sort-select') as HTMLSelectElement;
    favoritesFilter = document.getElementById('favorites-filter') as HTMLButtonElement;
    presentationsList = document.getElementById('presentations-list') as HTMLDivElement;
    directoriesList = document.getElementById('directories-list') as HTMLDivElement;
    newDirectoryInput = document.getElementById('new-directory-input') as HTMLInputElement;
    addDirectoryBtn = document.getElementById('add-directory-btn') as HTMLButtonElement;
    syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;
    syncProgress = document.getElementById('sync-progress') as HTMLDivElement;
    progressFill = document.getElementById('progress-fill') as HTMLDivElement;
    progressText = document.getElementById('progress-text') as HTMLDivElement;
    syncStatus = document.getElementById('sync-status') as HTMLDivElement;
    recoverDbBtn = document.getElementById('recover-db-btn') as HTMLButtonElement;
    recoveryStatus = document.getElementById('recovery-status') as HTMLDivElement;

    // Check if basic required elements exist
    const requiredElements = [
      { name: 'searchInput', element: searchInput },
      { name: 'presentationsList', element: presentationsList }
    ];

    console.log('Checking for required DOM elements...');
    for (const { name, element } of requiredElements) {
      if (!element) {
        console.error(`Required element ${name} not found in DOM`);
        return;
      } else {
        console.log(`✓ Found element: ${name}`);
      }
    }


  // Tab switching
  presentationsTab.addEventListener('click', () => switchTab('presentations'));
  settingsTab.addEventListener('click', () => switchTab('settings'));

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', handleSearch);
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', loadPresentations);
  }
  if (favoritesFilter) {
    favoritesFilter.addEventListener('click', toggleFavoritesFilter);
  }

  // Settings functionality
  if (addDirectoryBtn) {
    addDirectoryBtn.addEventListener('click', addDirectory);
  }

  // Sync functionality
  if (syncBtn && syncProgress) {
    syncBtn.addEventListener('click', async () => {
    try {
      syncBtn.disabled = true;
      syncProgress.classList.remove('hidden');
      
      // Set up progress listener
      window.electronAPI.onSyncProgress((progress: any) => {
        updateSyncProgress(progress);
      });
      
      const result = await window.electronAPI.performFullSync();
      
      // Clean up
      window.electronAPI.removeAllListeners('sync-progress');
      syncProgress.classList.add('hidden');
      syncBtn.disabled = false;
      
      // Reload presentations to reflect changes
      if (currentTab === 'presentations') {
        loadPresentations();
      }
    } catch (error) {
      console.error('Sync error:', error);
      syncProgress.classList.add('hidden');
      syncBtn.disabled = false;
    }
    });
  }

  // Database recovery functionality
  if (recoverDbBtn) {
    recoverDbBtn.addEventListener('click', async () => {
      try {
        recoverDbBtn.disabled = true;
        recoveryStatus.className = 'recovery-status';
        recoveryStatus.textContent = 'Se repară baza de date...';
        recoveryStatus.style.display = 'block';
        
        const success = await window.electronAPI.recoverDatabase();
        
        if (success) {
          recoveryStatus.className = 'recovery-status success';
          recoveryStatus.textContent = 'Baza de date a fost reparată cu succes! Vă rugăm să reporniți aplicația.';
        } else {
          recoveryStatus.className = 'recovery-status error';
          recoveryStatus.textContent = 'Repararea bazei de date a eșuat. Verificați jurnalele pentru detalii.';
        }
      } catch (error) {
        console.error('Database recovery error:', error);
        recoveryStatus.className = 'recovery-status error';
        recoveryStatus.textContent = 'Eroare la repararea bazei de date. Verificați jurnalele pentru detalii.';
      } finally {
        recoverDbBtn.disabled = false;
      }
    });
  }

  // Load initial content
  loadPresentations();
  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

function switchTab(tab: string) {
  currentTab = tab;
  
  // Update tab buttons
  presentationsTab.classList.toggle('active', tab === 'presentations');
  settingsTab.classList.toggle('active', tab === 'settings');
  
  // Update content
  presentationsContent.classList.toggle('active', tab === 'presentations');
  settingsContent.classList.toggle('active', tab === 'settings');
  
  // Load content based on tab
  if (tab === 'presentations') {
    loadPresentations();
  } else if (tab === 'settings') {
    loadSettings();
  }
}

function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}


async function handleSearch() {
  if (!searchInput) {
    console.error('Search input not initialized');
    return;
  }

  const query = searchInput.value.trim();
  if (query) {
    try {
      const results = await window.electronAPI.searchPresentations(query, { limit: 50 });
      displayPresentations(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  } else {
    loadPresentations();
  }
}

function toggleFavoritesFilter() {
  if (!favoritesFilter) {
    console.error('Favorites filter element not initialized');
    return;
  }
  showFavoritesOnly = !showFavoritesOnly;
  favoritesFilter.classList.toggle('active', showFavoritesOnly);
  loadPresentations();
}

// Presentations loading
async function loadPresentations() {
  if (!sortSelect || !presentationsList) {
    console.error('Presentation elements not initialized');
    return;
  }

  try {
    const orderBy = sortSelect.value;
    const presentations = await window.electronAPI.getAllPresentations(orderBy, 100);
    
    let filteredPresentations = presentations;
    if (showFavoritesOnly) {
      filteredPresentations = presentations.filter((p: any) => p.is_favorite);
    }
    
    currentPresentations = filteredPresentations;
    displayPresentations(filteredPresentations);
  } catch (error) {
    console.error('Error loading presentations:', error);
    if (presentationsList) {
      presentationsList.innerHTML = '<div class="error">Eroare la încărcarea prezentărilor</div>';
    }
  }
}

function displayPresentations(presentations: any[]) {
  if (!presentationsList) {
    console.error('Presentations list element not initialized');
    return;
  }

  if (presentations.length === 0) {
    presentationsList.innerHTML = '<div class="empty-state">Nu s-au găsit prezentări</div>';
    return;
  }

  const html = presentations.map(presentation => `
    <div class="presentation-card" data-path="${escapeHtml(presentation.path)}" onclick="openPresentation('${escapeHtml(presentation.path)}')">
      <div class="presentation-header">
        <h3 class="presentation-title">${escapeHtml(presentation.title_snippet || presentation.title)}</h3>
        <button class="favorite-btn ${presentation.is_favorite ? 'active' : ''}" 
                onclick="event.stopPropagation(); toggleFavorite('${escapeHtml(presentation.path)}')">
          ${presentation.is_favorite ? '★' : '☆'}
        </button>
      </div>
      ${presentation.content_snippet ? `
        <div class="content-snippet">
          ${escapeHtml(presentation.content_snippet)}
        </div>
      ` : ''}
      <div class="presentation-meta">
        <span class="view-count">👁️ ${presentation.view_count || 0}</span>
      </div>
      <div class="presentation-dates">
        <span>Actualizat: ${formatDate(presentation.updated_at)}</span>
      </div>
    </div>
  `).join('');

  presentationsList.innerHTML = html;
}

// Settings functionality
async function loadSettings() {
  try {
    const directories = await window.electronAPI.getWatchDirectories();
    displayDirectories(directories);
    
    const status = await window.electronAPI.getSyncStatus();
    updateSyncStatus(status);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function displayDirectories(directories: any[]) {
  const html = directories.map(dir => {
    const dirPath = typeof dir === 'string' ? dir : dir.path;
    const priority = typeof dir === 'object' ? dir.priority || 'medium' : 'medium';
    
    return `
    <div class="directory-item">
      <div class="directory-info">
        <span class="directory-path">${escapeHtml(dirPath)}</span>
        <span class="directory-priority">Prioritate: ${getPriorityText(priority)}</span>
      </div>
      <div class="directory-controls">
        <select class="priority-select" onchange="updateDirectoryPriority('${escapeHtml(dirPath)}', this.value)">
          <option value="high" ${priority === 'high' ? 'selected' : ''}>Înaltă</option>
          <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medie</option>
          <option value="low" ${priority === 'low' ? 'selected' : ''}>Scăzută</option>
        </select>
        <button class="remove-directory-btn" onclick="removeDirectory('${escapeHtml(dirPath)}')" title="Șterge folder">🗑️</button>
      </div>
    </div>
    `;
  }).join('');

  directoriesList.innerHTML = html;
}

function getPriorityText(priority: string): string {
  switch (priority) {
    case 'high': return 'Înaltă';
    case 'medium': return 'Medie';
    case 'low': return 'Scăzută';
    default: return 'Medie';
  }
}

async function addDirectory() {
  const newDir = newDirectoryInput.value.trim();
  if (newDir) {
    try {
      const currentDirs = await window.electronAPI.getWatchDirectories();
      const dirExists = currentDirs.some((dir: any) => 
        (typeof dir === 'string' ? dir : dir.path) === newDir
      );
      
      if (!dirExists) {
        const newDirObj = { path: newDir, priority: 'medium' };
        const updatedDirs = [...currentDirs, newDirObj];
        await window.electronAPI.setWatchDirectories(updatedDirs);
        newDirectoryInput.value = '';
        displayDirectories(updatedDirs);
      }
    } catch (error) {
      console.error('Error adding directory:', error);
    }
  }
}

// Global functions for onclick handlers
(window as any).removeDirectory = async (dirPath: string) => {
  try {
    const currentDirs = await window.electronAPI.getWatchDirectories();
    const updatedDirs = currentDirs.filter((d: any) => 
      (typeof d === 'string' ? d : d.path) !== dirPath
    );
    await window.electronAPI.setWatchDirectories(updatedDirs);
    displayDirectories(updatedDirs);
  } catch (error) {
    console.error('Error removing directory:', error);
  }
};

(window as any).updateDirectoryPriority = async (dirPath: string, newPriority: string) => {
  try {
    const currentDirs = await window.electronAPI.getWatchDirectories();
    const updatedDirs = currentDirs.map((d: any) => {
      if (typeof d === 'string') {
        return d === dirPath ? { path: d, priority: newPriority } : { path: d, priority: 'medium' };
      } else {
        return d.path === dirPath ? { ...d, priority: newPriority } : d;
      }
    });
    await window.electronAPI.setWatchDirectories(updatedDirs);
    displayDirectories(updatedDirs);
  } catch (error) {
    console.error('Error updating directory priority:', error);
  }
};

(window as any).toggleFavorite = async (path: string) => {
  try {
    await window.electronAPI.toggleFavorite(path);
    loadPresentations(); // Reload to update the UI
  } catch (error) {
    console.error('Error toggling favorite:', error);
  }
};

(window as any).openPresentation = async (path: string) => {
  try {
    await window.electronAPI.openPresentation(path);
    // Reload presentations to reflect updated view count
    if (currentTab === 'presentations') {
      loadPresentations();
    }
  } catch (error) {
    console.error('Error opening presentation:', error);
    alert('Nu s-a putut deschide prezentarea. Verifică dacă fișierul există și dacă ai software-ul necesar instalat.');
  }
};


function updateSyncProgress(progress: any) {
  const percentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${progress.current} (${progress.processed}/${progress.total})`;
}

function updateSyncStatus(status: any) {
  if (status.inProgress) {
    syncStatus.textContent = 'Sincronizare în curs...';
    syncBtn.disabled = true;
  } else {
    syncStatus.textContent = `Se monitorizează ${status.watchedDirectories.length} directoare`;
    syncBtn.disabled = false;
  }
}

// Utility functions
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Niciodată';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'Dată invalidă';
  }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded, initializing app...');
  initializeApp();
});

// Fallback in case DOMContentLoaded already fired
if (document.readyState === 'loading') {
  // DOM is still loading
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM is already loaded
  console.log('DOM already loaded, initializing immediately...');
  initializeApp();
}