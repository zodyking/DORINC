import { DEFAULT_CATALOG_CATEGORIES } from './catalog-default-categories'

export interface CatalogCategoryOption {
  id: string
  name: string
}

export interface CategoryInferenceResult {
  categoryId: string
  categoryName: string
  confidence: number
}

/**
 * Keyword hints per default category. Scored against item name/description —
 * compact vs. a per-word dictionary, but still deterministic and fast offline.
 */
const CATEGORY_KEYWORDS: Record<DefaultCatalogCategory, readonly string[]> = {
  'Lighting': [
    'light', 'lamp', 'bulb', 'led', 'marker', 'headlight', 'headlamp', 'tail light',
    'turn signal', 'beacon', 'strobe', 'fog', 'dome', 'clearance', 'running light',
    'f/r', 'front rear', 'marker light',
  ],
  'Electrical': [
    'wire', 'wiring', 'harness', 'fuse', 'relay', 'switch', 'circuit', 'ground',
    'connector', 'pigtail', 'module', 'ecu', 'pcm', 'voltage', 'amp', 'ohm',
    'solenoid', 'sensor', 'wiring harness', 'electrical',
  ],
  'Battery & Charging': [
    'battery', 'batteries', 'charging', 'alternator', 'starter cable', 'battery cable',
    'jump', 'isolator', 'inverter', 'converter', 'shore power', 'trickle',
  ],
  'Starting System': [
    'starter', 'starter motor', 'ignition', 'crank', 'solenoid', 'ring gear', 'flywheel',
    'starting', 'start system',
  ],
  'Engine': [
    'engine', 'motor', 'cylinder', 'piston', 'gasket', 'head gasket', 'valve', 'cam',
    'turbo', 'turbocharger', 'injector', 'timing', 'oil pump', 'crankshaft', 'block',
    'aftertreatment', 'def', 'dpf', 'scr', 'egr', 'emissions',
  ],
  'Fuel System': [
    'fuel', 'diesel', 'gasoline', 'tank', 'fuel pump', 'fuel filter', 'injector',
    'carburetor', 'regulator', 'fuel line', 'fuel rail', 'def fluid',
  ],
  'Cooling System': [
    'coolant', 'radiator', 'thermostat', 'water pump', 'hose', 'cooling', 'fan clutch',
    'overflow', 'degas', 'heater core', 'intercooler',
  ],
  'Air Intake': [
    'air filter', 'intake', 'air cleaner', 'turbo inlet', 'charge air', 'maf', 'air box',
    'air intake', 'precleaner',
  ],
  'Exhaust': [
    'exhaust', 'muffler', 'stack', 'pipe', 'clamps', 'flex pipe', 'rain cap', 'tailpipe',
    'manifold', 'catalytic',
  ],
  'Transmission': [
    'transmission', 'trans', 'clutch', 'flywheel', 'torque converter', 'gear', 'synchro',
    'pto', 'transfer case', 'shifter', 'trans fluid',
  ],
  'Driveline': [
    'driveshaft', 'drive shaft', 'u-joint', 'universal joint', 'differential', 'diff',
    'axle', 'half shaft', 'cv joint', 'pinion', 'yoke', 'driveline', 'carrier bearing',
  ],
  'Suspension': [
    'shock', 'strut', 'spring', 'air bag', 'airbag', 'leaf spring', 'bushing', 'suspension',
    'torque arm', 'equalizer', 'hanger', 'ride height',
  ],
  'Steering': [
    'steering', 'steer', 'tie rod', 'drag link', 'pitman', 'gear box', 'steering box',
    'power steering', 'steering wheel', 'kingpin',
  ],
  'Brakes': [
    'brake', 'brakes', 'pad', 'pads', 'rotor', 'drum', 'caliper', 'slack adjuster',
    'chamber', 'air brake', 'abs', 'brake line', 'brake hose',
  ],
  'Wheels & Tires': [
    'tire', 'tyre', 'wheel', 'rim', 'hub', 'lug', 'stud', 'valve stem', 'tpms',
    'wheel seal', 'bearing', 'hub seal', 'tire repair',
  ],
  'HVAC': [
    'ac', 'a/c', 'hvac', 'heater', 'blower', 'compressor', 'condenser', 'evaporator',
    'refrigerant', 'freon', 'climate', 'defrost', 'cab air',
  ],
  'Hydraulic': [
    'hydraulic', 'hyd', 'cylinder', 'hose', 'pump', 'valve', 'fitting', 'ptu',
    'wet kit', 'pto pump',
  ],
  'Air System': [
    'air tank', 'air dryer', 'air governor', 'air line', 'gladhand', 'air compressor',
    'air system', 'air bag', 'suspension air', 'air ride',
  ],
  'Trailer Components': [
    'trailer', 'fifth wheel', 'kingpin', 'landing gear', 'gladhand', 'trailer light',
    'trailer brake', 'trailer axle', 'mud flap', 'trailer door',
  ],
  'Body & Exterior': [
    'body', 'panel', 'fender', 'bumper', 'grille', 'grill', 'hood', 'cab', 'door',
    'mirror', 'step', 'fairing', 'roof', 'exterior', 'paint', 'decal',
  ],
  'Interior': [
    'seat', 'dash', 'interior', 'floor mat', 'console', 'headliner', 'trim', 'carpet',
    'cab interior', 'sleeper',
  ],
  'Safety Equipment': [
    'fire extinguisher', 'triangle', 'first aid', 'safety', 'ppe', 'hard hat',
    'reflective', 'warning', 'extinguisher', 'spill kit',
  ],
  'Fluids & Chemicals': [
    'oil', 'fluid', 'grease', 'lubricant', 'antifreeze', 'coolant', 'washer fluid',
    'brake fluid', 'power steering fluid', 'atf', 'gear oil', 'additive', 'chemical',
    'degreaser', 'solvent',
  ],
  'Fasteners & Hardware': [
    'bolt', 'nut', 'screw', 'washer', 'clip', 'clamp', 'fastener', 'hardware', 'rivet',
    'retainer', 'bracket', 'pin',
  ],
  'Shop Supplies': [
    'shop supplies', 'supplies', 'rags', 'gloves', 'tape', 'zip tie', 'shop towel',
    'disposable', 'consumable', 'misc supplies',
  ],
  'Accessories': [
    'accessory', 'accessories', 'gps', 'camera', 'radio', 'cb', 'charger', 'mount',
    'phone holder', 'tool box', 'chrome', 'upgrade',
  ],
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordsForCategory(name: string): string[] {
  const exact = DEFAULT_CATALOG_CATEGORIES.find(
    c => c.toLowerCase() === name.trim().toLowerCase(),
  )
  if (exact) return [...CATEGORY_KEYWORDS[exact], exact]

  const fromName = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3)
  return [name, ...fromName]
}

function scoreCategory(text: string, categoryName: string, keywords: string[]): number {
  const norm = normalizeForMatch(text)
  if (!norm) return 0

  let score = 0
  for (const kw of keywords) {
    const nkw = normalizeForMatch(kw)
    if (!nkw || !norm.includes(nkw)) continue
    if (nkw.includes(' ')) score += 4
    else if (nkw.length >= 8) score += 3
    else if (nkw.length >= 5) score += 2
    else score += 1
  }

  const nameNorm = normalizeForMatch(categoryName)
  if (nameNorm && norm.includes(nameNorm)) score += 5
  for (const word of nameNorm.split(' ')) {
    if (word.length >= 4 && norm.includes(word)) score += 1
  }

  return score
}

/** Minimum score to auto-select a category (tuned for short part names). */
const MIN_SCORE = 2

/**
 * Recommend a catalog category from free-text (name + optional description).
 * Returns null when confidence is too low.
 */
export function inferCatalogCategory(
  text: string,
  categories: CatalogCategoryOption[],
): CategoryInferenceResult | null {
  const input = text.trim()
  if (!input || !categories.length) return null

  let best: { category: CatalogCategoryOption, score: number } | null = null

  for (const category of categories) {
    const keywords = keywordsForCategory(category.name)
    const score = scoreCategory(input, category.name, keywords)
    if (!best || score > best.score) best = { category, score }
  }

  if (!best || best.score < MIN_SCORE) return null

  const maxPossible = 12
  const confidence = Math.min(1, best.score / maxPossible)

  return {
    categoryId: best.category.id,
    categoryName: best.category.name,
    confidence,
  }
}
