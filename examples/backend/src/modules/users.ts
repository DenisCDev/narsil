/**
 * Users Module
 */
import { defineModule } from "narsil";
import { users } from "../db/schema.js";

export const usersModule = defineModule({
  schema: users,
  crud: {
    list: { defaultLimit: 20, maxLimit: 100 },
    create: true,
    update: true,
    delete: true,
  },
  permissions: {
    list: "public",
    get: "public",
    create: "authenticated",
    update: "owner",
    delete: "admin",
  },
});
