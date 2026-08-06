/**
 * Default blank service log / service catalog sheet — matches the shop Letter template.
 * Items are sheet-local (not required to exist in the catalog DB).
 */

export interface ServiceLogSheetLine {
  id: string
  name: string
  /** Optional note under the service name (years, includes, etc.). */
  subtext: string
  /** Printed price label, e.g. "$35" or "$1,600". */
  price: string
  /** Optional link to a catalog item when added from catalog. */
  catalogItemId: string | null
}

export interface ServiceLogSheetSection {
  id: string
  title: string
  column: 'left' | 'right'
  items: ServiceLogSheetLine[]
}

export interface ServiceLogSheetDocument {
  version: 2
  sections: ServiceLogSheetSection[]
}

function line(id: string, name: string, price: string, subtext = ''): ServiceLogSheetLine {
  return { id, name, price, subtext, catalogItemId: null }
}

function section(
  id: string,
  title: string,
  column: 'left' | 'right',
  items: ServiceLogSheetLine[],
): ServiceLogSheetSection {
  return { id, title, column, items }
}

/** Exact default sections/items from the Devon Onsite Repairs Letter service catalog sheet. */
export function defaultServiceLogSheetDocument(): ServiceLogSheetDocument {
  return {
    version: 2,
    sections: [
      section('sec-cleaning', 'Cleaning', 'left', [
        line('item-steam-clean', 'Steam Clean Engine', '$35'),
        line('item-wash-body', 'Wash Bus Body', '$45'),
        line('item-clean-inside', 'Clean Inside Bus', '$35'),
        line('item-belts-on-seat', 'Install All Belts On Top Of Seat', '$35'),
        line('item-seat-cushion', 'Repair All Damage Seat Cushion', '$35'),
      ]),
      section('sec-seats', 'Seats', 'left', [
        line('item-loose-seats', 'Secure All Loose Seat Bottoms', '$45'),
      ]),
      section('sec-lights', 'Lights', 'left', [
        line('item-rear-brake-bulb', 'Replace Rear Brake Light Bulb', '$10'),
        line('item-signal-bulb', 'Replace Signal Light Bulb', '$10'),
        line('item-reverse-bulb', 'Replace Reverse Light Bulb', '$10'),
        line('item-marker-bulb', 'Replace Marker Light Bulb', '$10'),
        line('item-sign-bulb', 'Replace Sign Light Bulb', '$10'),
        line('item-state-warning-bulb', 'Replace State Warning Light Bulb', '$25'),
        line('item-headlight-bulb', 'Replace Headlight Bulb', '$25'),
        line('item-marker-led', 'Replace Marker Light LED', '$65'),
        line('item-brake-led', 'Replace Brake Light LED', '$125'),
        line('item-signal-led', 'Replace Signal Light LED', '$125'),
        line('item-signal-unit', 'Replace Signal Light Unit', '$35'),
        line('item-brake-unit', 'Replace Brake Light Unit', '$35'),
        line('item-dash-bulb', 'Replace Dashboard Light Bulb', '$120'),
      ]),
      section('sec-filters', 'Filters', 'left', [
        line('item-oil-filter', 'Replace Oil and Oil Filter', '$250'),
        line('item-fuel-filter', 'Replace Fuel Filter', '$55'),
        line('item-air-filter', 'Replace Air Filter', '$75'),
        line('item-water-separator', 'Replace Water Separator Filter', '$120'),
      ]),
      section('sec-brakes', 'Brakes and Hub Seals', 'left', [
        line('item-adjust-brakes', 'Adjust All Brakes', '$60'),
        line('item-rear-chamber', 'Replace Rear Brake Chamber', '$290'),
        line('item-rear-brake-hub', 'Replace Rear Brake and Hub Seal', '$650'),
        line('item-front-brake-hub', 'Replace Front Brake and Hub Seal', '$450'),
      ]),
      section('sec-springs', 'Springs, Shocks and Exhaust', 'left', [
        line('item-rear-spring', 'Replace Rear Spring Bushing and Pin', '$165'),
        line('item-shackle', 'Replace Spring Shackle and Bushing Hanger', '$395', 'Includes pins'),
        line('item-muffler', 'Replace Muffler', '$350'),
        line('item-rear-shock', 'Replace Rear Shock', '$190'),
        line('item-front-shock', 'Replace Front Shock', '$175'),
        line('item-king-pin', 'Replace King Pin', '$495'),
      ]),
      section('sec-battery', 'Battery', 'right', [
        line('item-hd-battery', 'Replace Heavy Duty Battery', '$200', '1000 cranking amps'),
      ]),
      section('sec-oil-turbo', 'Oil Pump and Turbocharger', 'right', [
        line('item-hpops-95-02', 'Replace High-Pressure Oil Pump', '$1,600', '1995 to 2002'),
        line('item-hpops-03-05', 'Replace High-Pressure Oil Pump', '$2,250', '2003 to 2005'),
        line('item-hpops-06-11', 'Replace High-Pressure Oil Pump', '$2,850', '2006 to 2011'),
        line('item-turbo-95-02', 'Replace Turbocharger', '$1,800', '1995 to 2002'),
        line('item-turbo-04-11', 'Replace Turbocharger', '$2,950', '2004 to 2011'),
      ]),
      section('sec-mirrors', 'Mirrors and Safety Supplies', 'right', [
        line('item-crossover-mirror', 'Replace Crossover Mirror', '$55'),
        line('item-west-coast-mirror', 'Replace West Coast Mirror', '$55'),
        line('item-first-aid', 'First Aid Kit', '$35'),
        line('item-fire-ext', 'Fire Extinguisher', '$85'),
      ]),
      section('sec-maxxforce', 'MaxxForce Diagnostics', 'right', [
        line('item-mf-oil', 'Replace MaxxForce Oil Filter', '$600'),
        line('item-mf-fuel', 'Replace MaxxForce Fuel Filter', '$145'),
        line('item-mf-injectors', 'Replace 6 MaxxForce Injectors', '$3,750'),
      ]),
      section('sec-tires', 'Tires', 'right', [
        line('item-tire-recap', 'Replace Tire Recap', '$265'),
        line('item-hd-tire-recap', 'Replace Heavy Duty Tire Recap', '$310'),
        line('item-front-tire', 'Replace Front Tire', '$550'),
      ]),
      section('sec-heaters', 'Heaters', 'right', [
        line('item-rear-heater', 'Replace Rear Heavy Duty Heater Motor', '$195'),
        line('item-front-heater-l', 'Replace Front Heater Motor, Left', '$195'),
        line('item-front-heater-r', 'Replace Front Heater Motor, Right', '$195'),
        line('item-stepwell-heater', 'Replace Step-Well Double-Blade Heater Motor', '$250'),
        line('item-rear-dbl-heater', 'Replace Rear Double-Blade Heater Motor', '$250'),
      ]),
      section('sec-inspection', 'Inspection', 'right', [
        line('item-inspection', 'Inspection Service', '$320'),
      ]),
    ],
  }
}

export const DEFAULT_SERVICE_LOG_SHEET_DOCUMENT = defaultServiceLogSheetDocument()
