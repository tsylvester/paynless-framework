import type { ISseConnection } from '@paynless/types';

export function isSseConnection(x: unknown): x is ISseConnection {
    if (typeof x !== 'object' || x === null) {
        return false;
    }
    return (
        'close' in x &&
        typeof x['close'] === 'function' &&
        'addEventListener' in x &&
        typeof x['addEventListener'] === 'function' &&
        'removeEventListener' in x &&
        typeof x['removeEventListener'] === 'function' &&
        'dispatchEvent' in x &&
        typeof x['dispatchEvent'] === 'function'
    );
}
