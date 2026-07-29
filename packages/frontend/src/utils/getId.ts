// Mongoose documents serialize their primary key as `_id`; some call sites
// construct plain objects with `id` instead. Centralizes the `_id ?? id`
// normalization used across categories/todos/scratch notes.
export interface WithId {
  _id?: string | null
  id?: string | null
}

export function getId(entity: WithId | null | undefined): string | undefined {
  return entity?._id ?? entity?.id ?? undefined
}
