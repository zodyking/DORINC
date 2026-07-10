import { describe, expect, it } from 'vitest'
import { inferCatalogCategory } from '../../shared/catalog-category-inference'

const categories = [
  { id: 'cat-lighting', name: 'Lighting' },
  { id: 'cat-electrical', name: 'Electrical' },
  { id: 'cat-brakes', name: 'Brakes' },
  { id: 'cat-fluids', name: 'Fluids & Chemicals' },
  { id: 'cat-supplies', name: 'Shop Supplies' },
  { id: 'cat-custom', name: 'Inspection' },
]

describe('inferCatalogCategory', () => {
  it('matches marker lights to Lighting', () => {
    const result = inferCatalogCategory('Replace F/R Marker Light', categories)
    expect(result?.categoryId).toBe('cat-lighting')
    expect(result?.categoryName).toBe('Lighting')
  })

  it('matches brake pads to Brakes', () => {
    const result = inferCatalogCategory('Install front brake pads', categories)
    expect(result?.categoryId).toBe('cat-brakes')
  })

  it('matches shop supplies fee text', () => {
    const result = inferCatalogCategory('Shop supplies 3.5%', categories)
    expect(result?.categoryId).toBe('cat-supplies')
  })

  it('returns null when no keyword matches', () => {
    expect(inferCatalogCategory('Miscellaneous', categories)).toBeNull()
  })

  it('can match custom categories by name tokens', () => {
    const result = inferCatalogCategory('Annual inspection labor', categories)
    expect(result?.categoryId).toBe('cat-custom')
  })
})
