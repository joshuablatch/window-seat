// Every drawn scene the app can ride through. A scene is one looping strip
// in scenes/<style>-<city>-<season>.jpg. New art just gets a line here.

export const STYLES = {
  pencil: {
    name: 'Pencil',
    wall: '#EFE8DA', frame: '#E4DACA', glass: '#F2EBDD', line: '#3A3631',
    text: '#1F1D1A', muted: '#5E584D', fade: '246,241,231',
    swatch: ['#F2EBDD', '#3A3631'], pole: 'rgba(58,54,49,0.55)',
  },
  watercolour: {
    name: 'Watercolour',
    wall: '#D6DBC8', frame: '#C3CBB0', glass: '#F4EEDF', line: '#6E7A5E',
    text: '#22261C', muted: '#48503B', fade: '214,219,200',
    swatch: ['#E8B98A', '#7FA4B8'], pole: 'rgba(60,72,44,0.45)',
  },
  lofi: {
    name: 'Lofi dusk',
    wall: '#26213A', frame: '#362F4F', glass: '#3B3360', line: '#5A5078',
    text: '#EFE8F6', muted: '#C9BFDB', fade: '38,33,58',
    swatch: ['#5B4A8A', '#F2A97A'], pole: 'rgba(14,10,26,0.6)',
  },
};

export const CITIES = ['Chicago', 'Tokyo', 'Paris', 'Lisbon', 'Kyoto', 'Amsterdam'];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

const AVAILABLE = [
  ['pencil', 'Chicago', 'Spring'],
  ['pencil', 'Chicago', 'Summer'],
  ['pencil', 'Chicago', 'Autumn'],
  ['pencil', 'Chicago', 'Winter'],
  ['pencil', 'Paris', 'Winter'],
  ['watercolour', 'Lisbon', 'Summer'],
  ['watercolour', 'Kyoto', 'Autumn'],
  ['lofi', 'Tokyo', 'Winter'],
  ['lofi', 'Amsterdam', 'Spring'],
];

const key = (style, city, season) => `${style}-${city}-${season}`.toLowerCase();
const index = new Set(AVAILABLE.map((a) => key(...a)));

export function sceneUrl(style, city, season) {
  return `scenes/${key(style, city, season)}.jpg`;
}

export function hasScene(style, city, season) {
  return index.has(key(style, city, season));
}

// Thumbnail for a city tile: its first drawn scene.
export function cityThumb(city) {
  const hit = AVAILABLE.find((a) => a[1] === city);
  return hit ? sceneUrl(...hit) : null;
}

// The closest drawn scene to what was asked for: keep the city, then the
// season, then the style.
export function nearestScene({ style, city, season }) {
  if (hasScene(style, city, season)) return { style, city, season };
  const sameCity = AVAILABLE.filter((a) => a[1] === city);
  const pick =
    sameCity.find((a) => a[2] === season) ||
    sameCity.find((a) => a[0] === style) ||
    sameCity[0] ||
    AVAILABLE[0];
  return { style: pick[0], city: pick[1], season: pick[2] };
}
