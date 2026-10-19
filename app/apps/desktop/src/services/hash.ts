import { node } from '@/lib/node';

/**
 * Content hashes for product data (`revision` of a reference-book record, and later the
 * asset names in `.testoritto/assets/`). Synchronous — callers already run in async flows.
 */
export function sha256Hex(data: Uint8Array | string): string {
  return node.crypto().createHash('sha256').update(data).digest('hex');
}
