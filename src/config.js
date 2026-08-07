// Static data + pure helpers (no game state). Ported/adapted from SOTD.
import { getLanguage } from './i18n.js';

// --- Isometric projection (SOTD's tile footprint) ---
export const TW = 84, TH = 42;          // iso tile width / height
export const WORLD_SCALE = 0.64;        // world-map tile scale (shared by view + minimap)
export function isoXY(r, c) {            // tile (row,col) -> screen offset px
  return [(c - r) * TW / 2, (c + r) * TH / 2];
}

// --- Standalone resource ids: 0 water, 1 food, 2 wood, 3 metal, 4 petrol ---
export const RES = [
  { key: 'water',  name: 'Water',  de: 'Wasser',      color: '#3fa7d6', icon: '💧' },
  { key: 'food',   name: 'Food',   de: 'Nahrung',     color: '#8cc63f', icon: '🥫' },
  { key: 'wood',   name: 'Wood',   de: 'Holz',        color: '#b5793a', icon: '🪵' },
  { key: 'metal',  name: 'Metal',  de: 'Metall',      color: '#9aa7b0', icon: '⚙️' },
  { key: 'petrol', name: 'Petrol', de: 'Treibstoff',  color: '#d98a3a', icon: '⛽' },
];
export const resIcon = (key) => RES.find((r) => r.key === key)?.icon || '▪';
export const resName = (key) => {
  const resource = RES.find((r) => r.key === key);
  return (getLanguage() === 'de' ? resource?.de : resource?.name) || key;
};

// Every facility opens its own action screen from a keyboard shortcut, the way
// each OG facility page had its own URL. Letters avoid the global M/L/O/Q/B set.
export const FACILITY_KEYS = {
  1: 'w',   // Life support (water)
  2: 'y',   // Scrapyard (yard)
  3: 'g',   // Garage
  4: 's',   // Storage
  8: 'f',   // Fortifications
  9: 'p',   // Power generator → power grid screen
  10: 'k',  // Troop quarters (barracks)
  11: 't',  // Toolshop → production screen
  12: 'r',  // Research center → tech tree
  13: 'a',  // Staff area
  15: 'j',  // Chemical laboratory
  16: 'c',  // Hospital (clinic)
  17: 'h',  // Headquarters
  18: 'i',  // Radio tower (intel)
};
export const facKey = (slot) => FACILITY_KEYS[slot] || null;
export const slotForKey = (key) => Number(Object.keys(FACILITY_KEYS).find((s) => FACILITY_KEYS[s] === key)) || null;

// --- Facility categories -> palette (drives building colour) ---
export const FAC_CAT = {
  core:     '#c9a24b',   // command / life
  power:    '#e6c200',   // energy
  prod:     '#6a9a4a',   // production
  storage:  '#8a7350',   // storage
  mil:      '#b1483a',   // military / defence
  research: '#4a86c9',   // science
  trade:    '#c98a3a',   // economy
  medical:  '#c95f8a',   // medical
  special:  '#8a6fc9',   // utility / covert
};

// --- Standalone facility catalogue (1..46) and presentation. ---
// Compact table: [type,key,category,English name,German name]
const _FAC = [
  [1,'life_support','core','Life support','Versorgungstrakt'],
  [2,'scrapyard','prod','Scrapyard','Schrottplatz'],
  [3,'garage','mil','Garage','Garage'],
  [4,'storage','storage','Storage','Lager'],
  [5,'prison','special','Prison','Gefängnis'],
  [6,'comm_center','special','Communication center','Kommunikationszentrum'],
  [7,'trade_post','trade','Trade post','Handelsposten'],
  [8,'fortifications','mil','Fortifications','Verteidigungsanlagen'],
  [9,'power_generator','power','Power generator','Kraftwerk'],
  [10,'troop_quarters','mil','Troop quarters','Truppenquartier'],
  [11,'toolshop','prod','Toolshop','Werkstatt'],
  [12,'research_center','research','Research center','Forschungszentrum'],
  [13,'staff_area','core','Staff area','Aufenthaltsraum'],
  [14,'heritage_room','special','Heritage Room','Ahnensaal'],
  [15,'chem_lab','research','Chemical laboratory','Chemielabor'],
  [16,'medical_center','medical','Hospital','Krankenhaus'],
  [17,'headquarters','core','Headquarters','Hauptquartier'],
  [18,'radio_tower','special','Radio tower','Funkturm'],
  [19,'decryption_room','research','Decryption room','Entschlüsselungsraum'],
  [20,'training_room','mil','Training room','Trainingsraum'],
  [21,'shooting_range','mil','Shooting range','Schießstand'],
  [22,'sick_bay','medical','Sick bay','Krankenrevier'],
  [23,'surgery_room','medical','Surgery room','Operationssaal'],
  [24,'lookout','mil','Lookout','Ausguck'],
  [25,'security_center','mil','Security center','Sicherheitszentrale'],
  [26,'alcohol_distillery','prod','Alcohol distillery','Schnapsbrennerei'],
  [27,'meth_lab','prod','Meth lab','Meth-Labor'],
  [28,'saferoom','storage','Saferoom','Sicherer Raum'],
  [29,'safe','storage','Safe','Tresor'],
  [30,'printing_press','special','Printing press','Druckerpresse'],
  [31,'entertainment_room','core','Entertainment room','Unterhaltungsraum'],
  [32,'waste_processing','prod','Waste processing','Müllverwertung'],
  [33,'recycling_center','prod','Recycling center','Recyclingzentrum'],
  [34,'assembly_line','prod','Assembly line','Fließband'],
  [35,'robot_factory','prod','Robot factory','Roboterfabrik'],
  [36,'spy_center','special','Spy center','Spionagezentrum'],
  [37,'radar_tower','special','Radar tower','Radarturm'],
  [38,'water_purifier','prod','Water purifier','Wasseraufbereitung'],
  [39,'hydroponic_plant','prod','Hydroponic plant','Hydrokulturanlage'],
  [40,'wind_generator','power','Wind generator','Windgenerator'],
  // Defensive emplacements. Ids continue past the ported catalogue so they cannot
  // collide with it; these are the pieces the tower-defence layout is built from.
  [41,'sniper_nest','mil','Sniper nest','Scharfschützennest'],
  [42,'mg_tower','mil','Machine gun tower','MG-Turm'],
  [43,'barricade','mil','Barricade','Barrikade'],
  // Terrain the player lays to steer a wave rather than to fight it.
  [44,'road','special','Road','Straße'],
  [45,'settler_house','core','Settler house','Siedlerhaus'],
];

// Emplacement reach in tiles, mirroring ZV2_DEFENSE_STATS in api/mechanics.php.
// Used to draw the coverage ring so a player can see what a gun actually holds
// before committing the resources.
export const FAC_RANGE = { 41: 5.5, 42: 2.5, 43: 1.2, 8: 1.8, 24: 4.0 };
export const FAC_DPS = { 41: 9, 42: 26, 43: 0, 8: 5, 24: 4 };
export const EMPLACEMENT_TYPES = [41, 42, 43];
export const facRange = (type, level = 1) => {
  const base = FAC_RANGE[type];
  return base ? base + (Math.max(1, level) - 1) * 0.4 : 0;
};
export const FAC = {};
for (const [type, key, cat, name, de] of _FAC) FAC[type] = { type, key, cat, name, de };

// Map labels only. Anything past ~16 characters gets ellipsised on the compound,
// which turned these into "Chemical labora…" and "Communication c…". The full
// names stay in menus, panels and tooltips where there is room for them.
const FAC_LABEL = {
  comm_center:     ['Comm center', 'Kommzentrum'],
  chem_lab:        ['Chemical lab', 'Chemielabor'],
  fortifications:  ['Fortifications', 'Verteidigung'],
  research_center: ['Research center', 'Forschung'],
};

export function facInfo(type) {
  const info = FAC[type] || { type, key: 'facility' + type, cat: 'special', name: 'Facility ' + type, de: 'Anlage ' + type };
  const de = getLanguage() === 'de';
  const short = FAC_LABEL[info.key];
  return { ...info, name: de ? info.de : info.name, label: short ? (de ? short[1] : short[0]) : (de ? info.de : info.name) };
}
export function facColor(type) { return FAC_CAT[facInfo(type).cat] || FAC_CAT.special; }

// --- the wasteland city (world map): colour a discovered building by what it is.
// Classify world building types by name rather than maintaining a large parallel table.
export const CITY_CAT = {
  home:     '#8a7350',
  office:   '#4a86c9',
  shop:     '#c98a3a',
  leisure:  '#8a6fc9',
  medical:  '#c95f8a',
  industry: '#6a9a4a',
  other:    '#8a8172',
};
export function cityCat(name) {
  const s = (name || '').toLowerCase();
  if (/hospital|clinic|medic|pharmac|surgery|doctor|drug/.test(s)) return 'medical';
  if (/apartment|residential|villa|house|home|hotel|motel/.test(s)) return 'home';
  if (/office|tower|bank|admin|court|hall/.test(s)) return 'office';
  if (/cafe|restaurant|bar\b|disco|club|fitness|cinema|theat|casino|pub/.test(s)) return 'leisure';
  if (/factory|warehouse|industr|garage|workshop|depot|plant|station|scrap|yard/.test(s)) return 'industry';
  if (/shop|store|market|boutique|baker|butcher|liquor|electronic|stationary|mall/.test(s)) return 'shop';
  return 'other';
}
export const cityColor = (name) => CITY_CAT[cityCat(name)] || CITY_CAT.other;

// Compact number: 1234 -> "1.2k", 2.4M, 1.1B. Small values stay exact.
export function fmtNum(n) {
  n = Math.round(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 1e9) return sign + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return sign + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return sign + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return sign + n;
}

// Compact duration: "M:SS" under an hour, else "Hh Mm".
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
