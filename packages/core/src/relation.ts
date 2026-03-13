/**
 * NexusFlow Relation Builders
 *
 * Declarative relation definitions between models.
 */

import type { RelationDescriptor } from './types.js'

export const relation = {
  /** Many-to-one: this model has a FK pointing to the target */
  belongsTo(target: string, foreignKey: string): RelationDescriptor {
    return { type: 'belongsTo', target, foreignKey }
  },

  /** One-to-many: the target model has a FK pointing to this model */
  hasMany(target: string, foreignKey: string): RelationDescriptor {
    return { type: 'hasMany', target, foreignKey }
  },

  /** One-to-one: the target model has a FK pointing to this model */
  hasOne(target: string, foreignKey: string): RelationDescriptor {
    return { type: 'hasOne', target, foreignKey }
  },

  /** Many-to-many: via a junction table */
  manyToMany(target: string, through: string): RelationDescriptor {
    return { type: 'manyToMany', target, foreignKey: '', through }
  },
} as const
