import { logger } from './logger';

// Network status monitoring
type ConnectionStatus = 'online' | 'offline' | 'unknown';
type ConnectionListener = (status: ConnectionStatus) => void;

class NetworkMonitor {
  private status: ConnectionStatus = 'unknown';
  private listeners: ConnectionListener[] = [];

  constructor() {
    this.initNetworkListeners();
  }

  private initNetworkListeners() {
    if (typeof window !== 'undefined') {
      // Set initial status
      this.status = navigator.onLine ? 'online' : 'offline';

      // Add event listeners for network changes
      window.addEventListener('online', () => this.updateStatus('online'));
      window.addEventListener('offline', () => this.updateStatus('offline'));

      logger.debug(`Network monitor initialized. Current status: ${this.status}`);
    }
  }

  private updateStatus(newStatus: ConnectionStatus) {
    const previousStatus = this.status;
    this.status = newStatus;
    
    logger.debug(`Network status changed: ${previousStatus} -> ${newStatus}`);
    
    // Notify all listeners
    this.listeners.forEach(listener => listener(newStatus));
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public addListener(listener: ConnectionListener): () => void {
    this.listeners.push(listener);
    
    // Return function to remove this listener
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public isOnline(): boolean {
    return this.status === 'online';
  }
}

// Create singleton instance
export const networkMonitor = new NetworkMonitor();