import type { DefaultCatalogCategory } from './catalog-default-categories'

/** Keyword hints per default category for catalog auto-detection. */
export const DEFAULT_CATEGORY_KEYWORDS: Record<DefaultCatalogCategory, readonly string[]> = {
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