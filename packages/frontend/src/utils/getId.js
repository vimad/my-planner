// Mongoose documents serialize their primary key as `_id`; some call sites
// construct plain objects with `id` instead. Centralizes the `_id ?? id`
// normalization used across categories/todos/scratch notes.
export function getId(entity) {
  return entity?._id ?? entity?.id
}
