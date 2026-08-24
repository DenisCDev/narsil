/**
 * Posts Module
 */
import { defineModule } from "narsil";
import { posts } from "../db/schema.js";

export const postsModule = defineModule({
  schema: posts,
  crud: {
    list: { defaultLimit: 10, maxLimit: 50 },
    create: true,
    update: true,
    delete: true,
  },
  permissions: {
    list: "public",
    get: "public",
    create: "authenticated",
    update: "owner",
    delete: "owner",
  },
  hooks: {
    beforeCreate: async ({ data, ctx }) => {
      console.log(`[Posts] Creating post by user ${ctx.user?.id}`);
    },
    afterCreate: async ({ data }) => {
      console.log(`[Posts] Post created:`, data);
    },
  },
});
