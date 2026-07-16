// Static data + pure helpers (no game state). Ported/adapted from SOTD.

// --- Isometric projection (SOTD's tile footprint) ---
export const TW = 84, TH = 42;          // iso tile width / height
export function isoXY(r, c) {            // tile (row,col) -> screen offset px
  return [(c - r) * TW / 2, (c + r) * TH / 2];
}

// --- Standalone resource ids: 0 water, 1 food, 2 wood, 3 metal, 4 petrol ---
export const RES = [
  { key: 'water',  name: 'Water',  de: 'Wasser',      color: '#3fa7d6' },
  { key: 'food',   name: 'Food',   de: 'Nahrung',     color: '#8cc63f' },
  { key: 'wood',   name: 'Wood',   de: 'Holz',        color: '#b5793a' },
  { key: 'metal',  name: 'Metal',  de: 'Metall',      color: '#9aa7b0' },
  { key: 'petrol', name: 'Petrol', de: 'Treibstoff',  color: '#d98a3a' },
];

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
];
export const FAC = {};
for (const [type, key, cat, name, de] of _FAC) FAC[type] = { type, key, cat, name, de };

export function facInfo(type) {
  return FAC[type] || { type, key: 'facility' + type, cat: 'special', name: 'Facility ' + type, de: 'Anlage ' + type };
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

// Compact duration: "M:SS" under an hour, else "Hh Mm".
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
