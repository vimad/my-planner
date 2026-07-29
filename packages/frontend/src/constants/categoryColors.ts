// Curated 12-swatch palette for category colors — used by category
// creation/edit UI and shared with future tickets so colors stay consistent.
// Slate is also the seeded color of the system "Uncategorized" category.
export interface CategoryColor {
  name: string
  hex: string
}

export const CATEGORY_COLORS: CategoryColor[] = [
  { name: 'Electric Blue', hex: '#4cc9f0' },
  { name: 'Indigo', hex: '#4361ee' },
  { name: 'Sky', hex: '#3a86ff' },
  { name: 'Violet', hex: '#8338ec' },
  { name: 'Magenta', hex: '#f72585' },
  { name: 'Rose', hex: '#e85d75' },
  { name: 'Red', hex: '#e63946' },
  { name: 'Amber', hex: '#f4a261' },
  { name: 'Gold', hex: '#ffd166' },
  { name: 'Lime', hex: '#06d6a0' },
  { name: 'Teal', hex: '#2a9d8f' },
  { name: 'Slate', hex: '#94a3b8' },
]
