/**
 * Third-party library re-exports
 * Centralized re-exports for commonly used third-party libraries.
 * This ensures a single source of truth for these dependencies.
 */

// Re-export uuid (all exports including v4)
export * from "uuid";

// Re-export pubsub-js
// Note: pubsub-js is a CommonJS module, import as namespace
import * as PubSubModule from "pubsub-js";
const PubSub = (PubSubModule as any).default || PubSubModule;
export default PubSub;
export { PubSub };

// Re-export toastify-js
// Note: toastify-js is a UMD module that expects window context
// The UMD wrapper sets root.Toastify, so we need to check window first
// then fall back to module exports
import * as ToastifyModule from "toastify-js";
const Toastify = 
  (typeof window !== 'undefined' && (window as any).Toastify) ||
  (ToastifyModule as any).default || 
  (ToastifyModule as any).Toastify || 
  ToastifyModule;
export { Toastify };

