/**
 * @fileoverview Backward-compatible export for SQLite service
 *
 * This file provides backward compatibility by re-exporting the refactored
 * SQLite service. All existing consumers can continue to import from this
 * file without any changes to their code.
 *
 * The refactored service maintains the exact same API while providing
 * better maintainability through the repository pattern.
 */

// Re-export the main SQLite service instance
export { default } from "@/services/sqlite";

// Re-export all types for consumers who need them
export * from "@/services/sqlite/core/types";
