/**
 * Posts Model
 *
 * This single file generates:
 * - GET    /api/posts          (list all posts)
 * - GET    /api/posts/:id      (get single post)
 * - POST   /api/posts          (create post)
 * - PATCH  /api/posts/:id      (update post)
 * - DELETE /api/posts/:id      (delete post)
 * - POST   /api/posts/publish  (custom procedure)
 *
 * Plus: TypeScript types, client SDK, Server Actions, RLS policies.
 */

import { defineModel, field, relation, defineProcedure } from '@nexusflow/core'

export const posts = defineModel('posts', {
  fields: {
    id:        field.uuid().primaryKey().default('gen_random_uuid()'),
    title:     field.text().min(1).max(200),
    content:   field.text().optional(),
    slug:      field.text().unique(),
    status:    field.enum(['draft', 'published', 'archived']).default('draft'),
    authorId:  field.uuid().references('profiles', 'id'),
    createdAt: field.timestamp().default('now()'),
    updatedAt: field.timestamp().default('now()').onUpdate('now()'),
  },

  relations: {
    author:   relation.belongsTo('profiles', 'authorId'),
    comments: relation.hasMany('comments', 'postId'),
  },

  permissions: {
    list:   'authenticated',
    get:    'authenticated',
    create: 'authenticated',
    update: 'owner',
    delete: 'owner',
  },

  cache: {
    list: { ttl: 60, tags: ['posts'] },
    get:  { ttl: 300, tags: ['posts'] },
  },

  hooks: {
    beforeCreate: async ({ data, ctx }) => {
      // Auto-generate slug from title
      const slug = (data as any).title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      return { ...data, slug, authorId: ctx.user?.id } as any
    },
  },

  procedures: {
    publish: defineProcedure()
      .input((z: any) => z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        return ctx.db.update('posts', { id: input.id }, { status: 'published' })
      }),
  },

  ownerField: 'authorId',
})
