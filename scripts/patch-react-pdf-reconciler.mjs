/**
 * Verifies the @react-pdf/reconciler index.js is in its original stock state.
 * The incompatibility with Next.js 16's React 19 transitional elements is now
 * handled in the API routes via normalizeTree() — no node_modules patch needed.
 * This script is a no-op kept for reference.
 */
console.log('[patch] @react-pdf/reconciler — no patch required (fix is in API routes).');
