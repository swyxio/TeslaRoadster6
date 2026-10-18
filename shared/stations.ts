/** Real site identities; deliberately compressed game coordinates, not navigation data.
 * Tesla sources checked 2026-10-17. Air service is fictional; no live stall data. */
export const STATIONS = [
  { id: 'sf-16th', name: 'SF · 16th Street', address: '2300 16th St, San Francisco, CA 94103', sourceUrl: 'https://www.tesla.com/en_CA/findus/location/supercharger/8739', x: 8, z: 30 },
  { id: 'sf-geary', name: 'SF · Geary Boulevard', address: '2675 Geary Blvd, San Francisco, CA 94118', sourceUrl: 'https://www.tesla.com/en_GB/findus/location/supercharger/SanFranciscoCAsupercharger2', x: -172, z: -90 },
  { id: 'oakland', name: 'Oakland · 2nd Street', address: '255 2nd Street, Oakland, CA 94607', sourceUrl: 'https://www.tesla.com/en_gb/findus/location/supercharger/oaklandcasupercharger', x: 188, z: -90 },
  { id: 'san-mateo', name: 'San Mateo · Park Place', address: '1200 Park Place, San Mateo, CA 94403', sourceUrl: 'https://www.tesla.com/en_CA/findus/location/supercharger/sanmateosupercharger', x: 8, z: 190 },
] as const;
