/**
 * @fileoverview Backward-compatible export for the main SQLite service.
 *
 * This file exists to maintain backward compatibility for any parts of the
 * application that were importing the SQLite service from its old location.
 * It now re-exports the refactored SQLite service from its new, more organized
 * location within the `sqlite/` directory.
 *
 * @see /services/sqlite/index.ts for the main implementation.
 *
 * @note New code should import directly from `@/services/sqlite` instead of
 * this file. This file may be deprecated and removed in a future refactor.
 */

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
