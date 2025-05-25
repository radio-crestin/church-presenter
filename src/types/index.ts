export interface PresentationData {
  title: string;
  content: string;
  path: string;
  fileSize: number;
}

export interface SyncProgress {
  total: number;
  processed: number;
  current: string;
}

export interface SyncStatus {
  inProgress: boolean;
  watchedDirectories: string[];
  isInitialized: boolean;
}

export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
}