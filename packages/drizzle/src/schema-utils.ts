/**
 * Drizzle Schema Utilities
 *
 * Extracts metadata from Drizzle pgTable definitions
 * without importing Drizzle types directly (uses duck typing).
 */

/**
 * Get the table name from a Drizzle table object.
 * Drizzle tables have a Symbol-based internal structure,
 * but also expose a friendly name via getTableName() or the Table symbol.
 */
export function getTableName(table: any): string {
  // drizzle-orm exposes getTableName
  if (typeof table === "object" && table !== null) {
    // Try the Symbol.for('drizzle:Name') approach
    const nameSymbol = Symbol.for("drizzle:Name");
    if (nameSymbol in table) {
      return table[nameSymbol] as string;
    }

    // Try _ internal config
    if (table._ && typeof table._.name === "string") {
      return table._.name;
    }

    // Try the Table config
    const configSymbol = Object.getOwnPropertySymbols(table).find(
      (s) => s.toString().includes("BaseName") || s.toString().includes("Name"),
    );
    if (configSymbol) {
      return table[configSymbol] as string;
    }
  }

  throw new Error("Cannot extract table name from Drizzle schema. Ensure you pass a pgTable() result.");
}

/**
 * Get the primary key column from a Drizzle table.
 * Returns the column object that has primaryKey: true.
 */
export function getPrimaryKeyColumn(table: any): { column: any; name: string } {
  const columns = getColumns(table);

  for (const [name, column] of Object.entries(columns)) {
    if ((column as any).primary || (column as any).primaryKey) {
      return { column, name };
    }
    // Check via config
    const config = (column as any).config;
    if (config?.primaryKey) {
      return { column, name };
    }
  }

  // Default: try 'id' column
  if ("id" in columns) {
    return { column: columns.id, name: "id" };
  }

  throw new Error("Cannot find primary key column in table. Add .primaryKey() to a column.");
}

/**
 * Get all columns from a Drizzle table.
 */
export function getColumns(table: any): Record<string, any> {
  if (typeof table !== "object" || table === null) {
    throw new Error("Invalid Drizzle table object");
  }

  // Drizzle table columns are the direct properties that are column objects
  const columns: Record<string, any> = {};
  for (const [key, value] of Object.entries(table)) {
    if (isColumn(value)) {
      columns[key] = value;
    }
  }

  return columns;
}

/**
 * Check if a value is a Drizzle column object.
 */
function isColumn(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  // Drizzle columns have specific symbols and properties
  const symbols = Object.getOwnPropertySymbols(value);
  return (
    symbols.some((s) => s.toString().includes("Column") || s.toString().includes("drizzle")) ||
    "dataType" in (value as any) ||
    "columnType" in (value as any)
  );
}
