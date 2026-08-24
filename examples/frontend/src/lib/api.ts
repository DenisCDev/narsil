/**
 * Type-Safe API Client
 *
 * Imports AppType from the backend for full type inference.
 */
import { createClient } from "@narsil/client-sdk";
import type { AppType } from "../../backend/src/server.js";

export const api = createClient<AppType>("http://localhost:3001/api", {
  getToken: () => {
    // In a real app, get token from auth provider
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth-token");
    }
    return null;
  },
});
