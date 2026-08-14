// Round initials avatar - first-of-its-kind in this app (no existing
// component to extend, every other person display today is plain text).
// Introduced for AddFromBacklogPopover.tsx's result rows (ticket 02 of
// .scratch/add-from-backlog); deliberately scoped to that feature only -
// retrofitting other existing plain-text person displays (capacity cards,
// membership <select>s, etc.) is explicitly out of scope for this change.
//
// Own curated palette, distinct from constants/categoryColors.ts's swatch
// list - categories and people are different domains and shouldn't
// visually collide (spec's explicit decision). `null`/unassigned always
// renders "UN" on the neutral slate below, never a palette color.
const AVATAR_PALETTE = [
  '#fb7185', // rose
  '#fb923c', // orange
  '#facc15', // yellow
  '#a3e635', // lime
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
  '#2dd4bf', // teal
]

const NEUTRAL_COLOR = '#64748b' // slate-500 - unassigned only, never drawn from AVATAR_PALETTE

function initialsFor(name: string | null): string {
  if (!name) return 'UN'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'UN'
  // One-word name: its own first two characters (spec example: a single
  // name has nothing to pair with, unlike "Vinod Madubashan" -> "VM").
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Deterministic per-name hash into AVATAR_PALETTE - same name always lands
// on the same swatch, across renders and mounts, since the hash is a pure
// function of the string itself (no random/id-based seeding).
function colorFor(name: string | null): string {
  if (!name) return NEUTRAL_COLOR
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export interface AvatarProps {
  name: string | null
  size?: 'sm' | 'md'
}

export function Avatar({ name, size = 'md' }: AvatarProps) {
  const dims = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]'
  return (
    <span
      title={name ?? 'Unassigned'}
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-full font-bold text-white ring-1 ring-black/10 dark:ring-white/10`}
      style={{ backgroundColor: colorFor(name) }}
    >
      {initialsFor(name)}
    </span>
  )
}
