/**
 * Database Client
 */
import { createDb } from "@narsil/drizzle";

export const db = await createDb({
  url: process.env.DATABASE_URL!,
});
