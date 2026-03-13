import { defineModel, field, relation } from '@nexusflow/core'

export const comments = defineModel('comments', {
  fields: {
    id:        field.uuid().primaryKey().default('gen_random_uuid()'),
    content:   field.text().min(1).max(2000),
    postId:    field.uuid().references('posts', 'id'),
    authorId:  field.uuid().references('profiles', 'id'),
    createdAt: field.timestamp().default('now()'),
  },

  relations: {
    post:   relation.belongsTo('posts', 'postId'),
    author: relation.belongsTo('profiles', 'authorId'),
  },

  permissions: {
    list:   'authenticated',
    get:    'authenticated',
    create: 'authenticated',
    update: 'owner',
    delete: ['owner', 'admin'],
  },

  ownerField: 'authorId',
})
