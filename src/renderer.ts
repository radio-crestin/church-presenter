// Renderer process script for Church Presenter

interface ElectronAPI {
  searchPresentations: (query: string, options?: any) => Promise<any[]>;
  getAllPresentations: (orderBy?: string, limit?: number) => Promise<any[]>;
  updateViewCount: (path: string) => Promise<number>;
  toggleFavorite: (path: string) => Promise<number>;
  openPresentation: (path: string) => Promise<{ success: boolean }>;
  getCategories: () => Promise<any[]>;
  createCategory: (name: string, orderIndex?: number) => Promise<number>;
  updateCategory: (id: number, name?: string, orderIndex?: number) => Promise<number>;
  deleteCategory: (id: number) => Promise<number>;
  addFolderToCategory: (categoryId: number, path: string, name?: string) => Promise<number>;
  removeFolderFromCategory: (folderId: number) => Promise<number>;
  performFullSync: () => Promise<{ total: number; processed: number }>;
  getSyncStatus: () => Promise<{ inProgress: boolean; watchedDirectories: string[]; isInitialized: boolean }>;
  recoverDatabase: () => Promise<boolean>;
  selectFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
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
let lastSearchQuery = '';
let lastSearchTerms: string[] = [];
let searchTimeout: NodeJS.Timeout | null = null;

// DOM Elements (will be initialized after DOM loads)
let presentationsTab: HTMLButtonElement;
let settingsTab: HTMLButtonElement;
let presentationsContent: HTMLDivElement;
let settingsContent: HTMLDivElement;
let searchInput: HTMLInputElement;
let searchBtn: HTMLButtonElement;
let searchContentCheckbox: HTMLInputElement;
let sortSelect: HTMLSelectElement;
let favoritesFilter: HTMLButtonElement;
let presentationsList: HTMLDivElement;
let searchLoading: HTMLDivElement;
let categoriesList: HTMLDivElement;
let addCategoryBtn: HTMLButtonElement;
let categoryNameInput: HTMLInputElement;
let syncBtn: HTMLButtonElement;
let syncProgress: HTMLDivElement;
let progressFill: HTMLDivElement;
let progressText: HTMLDivElement;
let syncStatus: HTMLDivElement;
let recoverDbBtn: HTMLButtonElement;
let recoveryStatus: HTMLDivElement;
let searchWhileTypingCheckbox: HTMLInputElement;

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
    searchContentCheckbox = document.getElementById('search-content') as HTMLInputElement;
    sortSelect = document.getElementById('sort-select') as HTMLSelectElement;
    favoritesFilter = document.getElementById('favorites-filter') as HTMLButtonElement;
    presentationsList = document.getElementById('presentations-list') as HTMLDivElement;
    searchLoading = document.getElementById('search-loading') as HTMLDivElement;
    categoriesList = document.getElementById('categories-list') as HTMLDivElement;
    addCategoryBtn = document.getElementById('add-category-btn') as HTMLButtonElement;
    categoryNameInput = document.getElementById('category-name-input') as HTMLInputElement;
    syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;
    syncProgress = document.getElementById('sync-progress') as HTMLDivElement;
    progressFill = document.getElementById('progress-fill') as HTMLDivElement;
    progressText = document.getElementById('progress-text') as HTMLDivElement;
    syncStatus = document.getElementById('sync-status') as HTMLDivElement;
    recoverDbBtn = document.getElementById('recover-db-btn') as HTMLButtonElement;
    recoveryStatus = document.getElementById('recovery-status') as HTMLDivElement;
    searchWhileTypingCheckbox = document.getElementById('search-while-typing') as HTMLInputElement;

    // Check if basic required elements exist
    const requiredElements = [
      { name: 'searchInput', element: searchInput },
      { name: 'presentationsList', element: presentationsList },
      { name: 'categoriesList', element: categoriesList },
      { name: 'addCategoryBtn', element: addCategoryBtn },
      { name: 'categoryNameInput', element: categoryNameInput }
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
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    });
    
    // Add search-while-typing functionality
    searchInput.addEventListener('input', () => {
      handleSearchWhileTyping();
    });
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
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', createCategory);
  }
  if (categoryNameInput) {
    categoryNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        createCategory();
      }
    });
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
        // Confirm the action since it will delete all data
        const confirmed = confirm(
          'Această acțiune va șterge TOATE datele din baza de date și va crea o bază de date nouă, goală.\n\n' +
          'Toate prezentările indexate, favoritele, categoriile și statisticile vor fi pierdute.\n\n' +
          'Ești sigur că vrei să continui?'
        );

        if (!confirmed) {
          return;
        }

        recoverDbBtn.disabled = true;
        recoveryStatus.className = 'recovery-status';
        recoveryStatus.textContent = 'Se recreează baza de date...';
        recoveryStatus.style.display = 'block';

        const success = await window.electronAPI.recoverDatabase();

        if (success) {
          recoveryStatus.className = 'recovery-status success';
          recoveryStatus.textContent = 'Baza de date a fost recreată cu succes! Interfața se actualizează...';

          // Clear current presentations state
          currentPresentations = [];

          // Refresh the UI to show empty state
          if (currentTab === 'presentations') {
            // Clear search input
            if (searchInput) {
              searchInput.value = '';
            }

            // Reset favorites filter
            showFavoritesOnly = false;
            if (favoritesFilter) {
              favoritesFilter.classList.remove('active');
            }

            // Load presentations (should be empty now)
            await loadPresentations();
          } else if (currentTab === 'settings') {
            // Reload settings to show empty categories
            await loadSettings();
          }

          // Update success message
          recoveryStatus.textContent = 'Baza de date a fost recreată cu succes! Interfața a fost actualizată.';

          // Hide success message after 5 seconds
          setTimeout(() => {
            recoveryStatus.style.display = 'none';
          }, 5000);
        } else {
          recoveryStatus.className = 'recovery-status error';
          recoveryStatus.textContent = 'Recrearea bazei de date a eșuat. Verificați jurnalele pentru detalii.';
        }
      } catch (error) {
        console.error('Database recovery error:', error);
        recoveryStatus.className = 'recovery-status error';
        recoveryStatus.textContent = 'Eroare la recrearea bazei de date. Verificați jurnalele pentru detalii.';
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



async function handleSearch() {
  if (!searchInput || !searchLoading || !presentationsList || !searchContentCheckbox) {
    console.error('Search elements not initialized');
    return;
  }

  const query = searchInput.value.trim();

  if (query) {
    try {
      // Show loading indicator
      searchLoading.classList.remove('hidden');
      presentationsList.style.display = 'none';

      // Determine search options based on checkbox
      const searchInContent = searchContentCheckbox.checked;
      const searchOptions = {
        limit: 50,
        searchInContent: searchInContent,
        includeFTS: true,
      };

      const results = await window.electronAPI.searchPresentations(query, searchOptions);

      // Store search information for highlighting
      lastSearchQuery = query;
      lastSearchTerms = query.split(/\s+/).filter(term => term.length > 0);

      // Hide loading indicator and show results
      searchLoading.classList.add('hidden');
      presentationsList.style.display = 'flex';

      displayPresentations(results);
    } catch (error) {
      console.error('Search error:', error);

      // Hide loading indicator on error
      searchLoading.classList.add('hidden');
      presentationsList.style.display = 'flex';

      // Show error message
      presentationsList.innerHTML = '<div class="error">Eroare la căutarea prezentărilor</div>';
    }
  } else {
    // For empty query, just load all presentations without loading indicator
    loadPresentations();
  }
}

// Search while typing functionality
function handleSearchWhileTyping() {
  // Clear any existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // Only proceed if search-while-typing is enabled
  if (!searchWhileTypingCheckbox || !searchWhileTypingCheckbox.checked) {
    return;
  }

  // Set a new timeout for delayed search
  searchTimeout = setTimeout(() => {
    const query = searchInput?.value?.trim();
    
    // Only search if there's a meaningful query (at least 2 characters)
    if (query && query.length >= 2) {
      console.log('Auto-searching for:', query);
      handleSearch();
    } else if (!query || query.length === 0) {
      // If input is empty, load all presentations
      loadPresentations();
    }
  }, 300); // 300ms delay
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
    // Clear search terms when loading regular presentations
    lastSearchQuery = '';
    lastSearchTerms = [];

    // Ensure presentations list uses flex layout
    if (presentationsList) {
      presentationsList.style.display = 'flex';
    }

    const orderBy = sortSelect.value;
    const presentations = await window.electronAPI.getAllPresentations(orderBy, 50);

    let filteredPresentations = presentations;
    if (showFavoritesOnly) {
      filteredPresentations = presentations.filter((p: any) => p.is_favorite);
    }

    currentPresentations = filteredPresentations;
    displayPresentations(filteredPresentations);
  } catch (error) {
    console.error('Error loading presentations:', error);
    if (presentationsList) {
      presentationsList.style.display = 'flex';
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

  const html = presentations.slice(0, 50).map(presentation => {
    // Create content snippet if it doesn't exist (for non-search results)
    let contentSnippet = presentation.content_snippet;
    if (!contentSnippet && presentation.content) {
      // Create a snippet from the full content (first 200 characters)
      contentSnippet = presentation.content.length > 200 
        ? presentation.content.substring(0, 200) + '...' 
        : presentation.content;
    }

    // Use highlighting if we have search terms, otherwise use regular escaping
    const titleToDisplay = lastSearchTerms.length > 0 
      ? highlightSearchTerms(presentation.title_snippet || presentation.title, lastSearchTerms)
      : escapeHtml(presentation.title_snippet || presentation.title);
    
    const contentToDisplay = contentSnippet && lastSearchTerms.length > 0
      ? highlightSearchTerms(contentSnippet, lastSearchTerms)
      : escapeHtml(contentSnippet || '');

    return `
    <div class="presentation-card" data-path="${escapeHtml(presentation.path)}" onclick="openPresentation('${escapeHtml(presentation.path)}')">
      <div class="presentation-header">
        <h3 class="presentation-title">${titleToDisplay}</h3>
        <button class="favorite-btn ${presentation.is_favorite ? 'active' : ''}" 
                onclick="event.stopPropagation(); toggleFavorite('${escapeHtml(presentation.path)}')">
          ${presentation.is_favorite ? '★' : '☆'}
        </button>
      </div>
      ${contentSnippet ? `
        <div class="content-snippet">
          ${contentToDisplay}
        </div>
      ` : ''}
      <div class="presentation-meta">
        <span class="view-count">👁️ ${presentation.view_count || 0}</span>
      </div>
    </div>
    `;
  }).join('');

  presentationsList.innerHTML = html;
}

// Settings functionality
async function loadSettings() {
  try {
    const categories = await window.electronAPI.getCategories();
    displayCategories(categories);

    const status = await window.electronAPI.getSyncStatus();
    updateSyncStatus(status);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function displayCategories(categories: any[]) {
  if (!categoriesList) {
    console.error('categoriesList element not found');
    return;
  }

  const html = categories.map(category => {
    const folders = category.folders || [];

    return `
    <div class="category-item" data-category-id="${category.id}">
      <div class="category-header">
        <div class="category-info">
          <h3 class="category-name" contenteditable="true" onblur="updateCategoryName(${category.id}, this.textContent)">${escapeHtml(category.name)}</h3>
          <span class="category-stats">${folders.length} foldere</span>
        </div>
        <div class="category-controls">
          <input type="number" class="order-input" value="${category.order_index}" onchange="updateCategoryOrder(${category.id}, this.value)" title="Index ordine">
          <button class="add-folder-btn" onclick="addFolderToCategory(${category.id})" title="Adaugă folder">📁+</button>
          <button class="delete-category-btn" onclick="deleteCategory(${category.id})" title="Șterge categoria">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="folders-list">
        ${folders.map((folder: any) => `
          <div class="folder-item">
            <span class="folder-path" title="${escapeHtml(folder.path)}">${escapeHtml(folder.name || folder.path)}</span>
            <button class="remove-folder-btn" onclick="removeFolderFromCategory(${folder.id})" title="Șterge folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
    `;
  }).join('');

  categoriesList.innerHTML = html;
}

async function createCategory() {
  try {
    if (!categoryNameInput) {
      console.error('Category name input not found');
      return;
    }

    const categoryName = categoryNameInput.value.trim();
    if (!categoryName) {
      alert('Te rog introdu un nume pentru categorie.');
      return;
    }

    // Get current categories to determine next order index
    const categories = await window.electronAPI.getCategories();
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order_index)) : -1;
    const orderIndex = maxOrder + 1;

    await window.electronAPI.createCategory(categoryName, orderIndex);
    categoryNameInput.value = '';

    // Reload settings to show new category
    loadSettings();

  } catch (error) {
    console.error('Error creating category:', error);
    alert(`Eroare la crearea categoriei: ${error instanceof Error ? error.message : 'Încearcă din nou.'}`);
  }
}

async function addFolderToCategory(categoryId: number) {
  try {
    console.log('Starting folder selection for category:', categoryId);

    // Open folder selection dialog
    const result = await window.electronAPI.selectFolder();
    console.log('Folder selection result:', JSON.stringify(result, null, 2));

    // Check if user canceled the dialog
    if (result?.canceled === true) {
      console.log('User canceled folder selection');
      return;
    }

    // Check if we have a valid result with filePaths
    if (!result || !result.filePaths || !Array.isArray(result.filePaths)) {
      console.log('Invalid result structure');
      console.log('Expected: { canceled: boolean, filePaths: string[] }');
      console.log('Received:', result);
      alert('Eroare la selectarea folderului. Încearcă din nou.');
      return;
    }

    if (result.filePaths.length === 0) {
      console.log('No folder selected - filePaths array is empty');
      return;
    }

    const selectedFolder = result.filePaths[0];
    console.log('Selected folder path:', selectedFolder);

    if (!selectedFolder || typeof selectedFolder !== 'string') {
      console.log('Invalid folder path:', selectedFolder);
      alert('Calea folderului selectat nu este validă.');
      return;
    }

    // Check if folder already exists in any category
    const categories = await window.electronAPI.getCategories();
    const folderExists = categories.some(category =>
      category.folder_paths && category.folder_paths.includes(selectedFolder)
    );

    if (folderExists) {
      console.log('Folder already exists in a category');
      alert('Acest folder este deja monitorizat într-o categorie.');
      return;
    }

    await window.electronAPI.addFolderToCategory(categoryId, selectedFolder);
    console.log('Folder added to category successfully');

    // Reload settings to show updated category
    loadSettings();

    // Automatically trigger sync for the new folder
    if (syncBtn && !syncBtn.disabled) {
      console.log('Auto-triggering sync for new folder:', selectedFolder);
      syncBtn.click();
    } else {
      console.log('Sync button not available or disabled');
    }

  } catch (error) {
    console.error('Error adding folder to category:', error);
    alert(`Eroare la adăugarea folderului: ${error instanceof Error ? error.message : 'Verifică permisiunile și încearcă din nou.'}`);
  }
}

// Global functions for onclick handlers
(window as any).updateCategoryName = async (categoryId: number, newName: string) => {
  try {
    const trimmedName = newName?.trim();
    if (!trimmedName) {
      loadSettings(); // Reload to reset the name
      return;
    }
    await window.electronAPI.updateCategory(categoryId, trimmedName);
  } catch (error) {
    console.error('Error updating category name:', error);
    loadSettings(); // Reload on error
  }
};

(window as any).updateCategoryOrder = async (categoryId: number, newOrder: string) => {
  try {
    const orderIndex = parseInt(newOrder, 10);
    if (isNaN(orderIndex)) {
      loadSettings(); // Reload to reset the order
      return;
    }
    await window.electronAPI.updateCategory(categoryId, undefined, orderIndex);
    loadSettings(); // Reload to show updated order
  } catch (error) {
    console.error('Error updating category order:', error);
    loadSettings(); // Reload on error
  }
};

(window as any).deleteCategory = async (categoryId: number) => {
  try {
    if (confirm('Ești sigur că vrei să ștergi această categorie? Toate folderele din categorie vor fi eliminate din monitorizare.')) {
      await window.electronAPI.deleteCategory(categoryId);
      loadSettings(); // Reload to show updated categories
    }
  } catch (error) {
    console.error('Error deleting category:', error);
    alert('Eroare la ștergerea categoriei. Încearcă din nou.');
  }
};

(window as any).addFolderToCategory = addFolderToCategory;

(window as any).removeFolderFromCategory = async (folderId: number) => {
  try {
    if (confirm('Ești sigur că vrei să ștergi acest folder din monitorizare?')) {
      await window.electronAPI.removeFolderFromCategory(folderId);
      loadSettings(); // Reload to show updated categories
    }
  } catch (error) {
    console.error('Error removing folder from category:', error);
    alert('Eroare la ștergerea folderului. Încearcă din nou.');
  }
};

(window as any).toggleFavorite = async (path: string) => {
  try {
    const newFavoriteStatus = await window.electronAPI.toggleFavorite(path);

    // Update the current presentations state
    if (currentPresentations && currentPresentations.length > 0) {
      const presentation = currentPresentations.find(p => p.path === path);
      if (presentation) {
        presentation.is_favorite = newFavoriteStatus === 1;
        // Update the UI to reflect the new favorite status
        updateFavoriteButton(path, presentation.is_favorite);
      }
    }

    // If we're showing only favorites and this presentation is no longer a favorite, remove it
    if (showFavoritesOnly && newFavoriteStatus === 0) {
      const card = document.querySelector(`[data-path="${path}"]`);
      if (card) {
        card.remove();
      }
      // Update currentPresentations to remove the unfavorited item
      currentPresentations = currentPresentations.filter(p => p.path !== path);
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
  }
};

// Helper function to update favorite button state
function updateFavoriteButton(path: string, isFavorite: boolean) {
  const cards = document.querySelectorAll('.presentation-card');
  cards.forEach(card => {
    if (card.getAttribute('data-path') === path) {
      const favoriteBtn = card.querySelector('.favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.classList.toggle('active', isFavorite);
        favoriteBtn.textContent = isFavorite ? '★' : '☆';
      }
    }
  });
}

(window as any).openPresentation = async (path: string) => {
  try {
    // Find the presentation card and add opening state
    const cards = document.querySelectorAll('.presentation-card');
    let targetCard: Element | null = null;

    cards.forEach(card => {
      if (card.getAttribute('data-path') === path) {
        targetCard = card;
        card.classList.add('opening');
      }
    });

    // Immediately update view count in UI before API call
    if (currentPresentations && currentPresentations.length > 0) {
      const presentation = currentPresentations.find(p => p.path === path);
      if (presentation) {
        presentation.view_count = (presentation.view_count || 0) + 1;
        // Update the display to show new view count immediately
        updatePresentationViewCount(path, presentation.view_count);
      }
    }

    await window.electronAPI.openPresentation(path);

    // Remove opening state after a short delay
    setTimeout(() => {
      if (targetCard) {
        targetCard.classList.remove('opening');
      }
    }, 300);

  } catch (error) {
    // Remove opening state on error and revert view count
    const cards = document.querySelectorAll('.presentation-card');
    cards.forEach(card => {
      if (card.getAttribute('data-path') === path) {
        card.classList.remove('opening');
      }
    });

    // Revert view count on error
    if (currentPresentations && currentPresentations.length > 0) {
      const presentation = currentPresentations.find(p => p.path === path);
      if (presentation) {
        presentation.view_count = Math.max((presentation.view_count || 1) - 1, 0);
        updatePresentationViewCount(path, presentation.view_count);
      }
    }

    console.error('Error opening presentation:', error);
    alert('Nu s-a putut deschide prezentarea. Verifică dacă fișierul există și dacă ai software-ul necesar instalat.');
  }
};

// Helper function to update view count in the display
function updatePresentationViewCount(path: string, newViewCount: number) {
  const cards = document.querySelectorAll('.presentation-card');
  cards.forEach(card => {
    if (card.getAttribute('data-path') === path) {
      const viewCountElement = card.querySelector('.view-count');
      if (viewCountElement) {
        viewCountElement.textContent = `👁️ ${newViewCount}`;
      }
    }
  });
}


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

// Search highlighting functionality with enhanced religious name normalization
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

function highlightSearchTerms(text: string, searchTerms: string[]): string {
  if (!text || !searchTerms || searchTerms.length === 0) {
    return escapeHtml(text);
  }

  // Escape HTML first
  let escapedText = escapeHtml(text);
  
  // Normalize the text for comparison
  const normalizedText = normalizeForSearch(text);
  
  // Sort terms by length (longest first) to avoid partial matches overriding longer matches
  const sortedTerms = searchTerms
    .filter(term => term.length > 0)
    .map(term => normalizeForSearch(term))
    .sort((a, b) => b.length - a.length);

  // Keep track of replacements to avoid double-highlighting
  const replacements: Array<{start: number, end: number, replacement: string}> = [];

  for (const normalizedTerm of sortedTerms) {
    if (normalizedTerm.length === 0) continue;
    
    let searchIndex = 0;
    while (searchIndex < normalizedText.length) {
      const foundIndex = normalizedText.indexOf(normalizedTerm, searchIndex);
      if (foundIndex === -1) break;
      
      const endIndex = foundIndex + normalizedTerm.length;
      
      // Check if this overlaps with any existing replacement
      const overlaps = replacements.some(r => 
        (foundIndex >= r.start && foundIndex < r.end) ||
        (endIndex > r.start && endIndex <= r.end) ||
        (foundIndex <= r.start && endIndex >= r.end)
      );
      
      if (!overlaps) {
        // Get the original text segment (before HTML escaping)
        const originalSegment = text.substring(foundIndex, endIndex);
        const escapedSegment = escapeHtml(originalSegment);
        const highlightedSegment = `<span class="search-highlight">${escapedSegment}</span>`;
        
        replacements.push({
          start: foundIndex,
          end: endIndex,
          replacement: highlightedSegment
        });
      }
      
      searchIndex = foundIndex + 1;
    }
  }

  // Sort replacements by start position (descending) to apply from end to beginning
  replacements.sort((a, b) => b.start - a.start);
  
  // Apply replacements to the escaped text
  let result = escapedText;
  for (const replacement of replacements) {
    // Find the corresponding position in the escaped text
    // This is tricky because HTML escaping changes character positions
    // We'll use a simpler approach: escape the original segment and replace it
    const originalSegment = text.substring(replacement.start, replacement.end);
    const escapedSegment = escapeHtml(originalSegment);
    
    // Find and replace the first occurrence of this escaped segment
    const index = result.indexOf(escapedSegment);
    if (index !== -1) {
      result = result.substring(0, index) + replacement.replacement + result.substring(index + escapedSegment.length);
    }
  }
  
  return result;
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
