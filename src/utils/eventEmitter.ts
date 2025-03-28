// Path: src/utils/eventEmitter.ts
interface EventMap {
    'session-checked': { session: boolean };
    'user-loaded': { user: boolean };
    'auth-state-changed': { session: boolean };
    'subscription-loaded': { subscription: boolean };
    // Add more events as needed
}

type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

class EventEmitter {
    private listeners: { [K in keyof EventMap]?: Listener<K>[] } = {};

    on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event]?.push(listener);
        return () => this.off(event, listener);
    }

    off<K extends keyof EventMap>(event: K, listener: Listener<K>): void {
        this.listeners[event] = this.listeners[event]?.filter(l => l !== listener);
    }

    emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
        this.listeners[event]?.forEach(listener => listener(data));
    }
}

export const eventEmitter = new EventEmitter();


