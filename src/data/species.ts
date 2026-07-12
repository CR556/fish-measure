/**
 * North American freshwater game-fish roster for v1.
 *
 * Weight model per species:
 * - `ws`: standard-weight coefficients in METRIC form
 *     log10(Ws grams) = a + b * log10(TL mm)
 *   Primary sources: Blackwell, Brown & Willis (2000), "Relative Weight (Wr):
 *   Status and Current Use," Reviews in Fisheries Science 8(1); and Neumann,
 *   Guy & Willis (2012), "Length, Weight, and Associated Indices," ch. 15 in
 *   AFS Fisheries Techniques (3rd ed.).
 * - `girthFamily`: body-shape class for the length×girth² estimator used when
 *   a girth measurement is available (see weight.ts). Always approximate.
 *
 * IMPORTANT: `wsVerified` marks whether a coefficient pair has been checked
 * against the primary source. Values are currently transcribed and flagged
 * unverified — run the sourced verification pass before trusting the Ws
 * numbers. The girth-based estimate (which we can always compute from the
 * LiDAR girth) does not depend on these.
 */

export type GirthFamily =
  | 'trout_salmon'
  | 'bass'
  | 'panfish'
  | 'pike'
  | 'walleye_perch'
  | 'catfish'
  | 'carp_sucker'
  | 'other';

export type SpeciesDef = {
  id: string;
  common: string;
  scientific: string;
  aliases: string[];
  /** log10(Ws g) = a + b·log10(TL mm); null when no reliable Ws is bundled. */
  ws: { a: number; b: number } | null;
  wsSource: string | null;
  wsVerified: boolean;
  girthFamily: GirthFamily;
  /** Plausible total-length bounds (cm) — sanity clamp for AI + weight. */
  lengthRangeCm: [number, number];
};

const BLACKWELL = 'Blackwell et al. 2000 (Rev. Fish. Sci. 8:1)';
const NEUMANN = 'Neumann et al. 2012 (AFS Fisheries Techniques ch.15)';

export const SPECIES: SpeciesDef[] = [
  // --- Black bass ---
  { id: 'largemouth_bass', common: 'Largemouth Bass', scientific: 'Micropterus salmoides', aliases: ['largemouth', 'bucketmouth', 'lmb'], ws: { a: -5.528, b: 3.273 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'bass', lengthRangeCm: [10, 75] },
  { id: 'smallmouth_bass', common: 'Smallmouth Bass', scientific: 'Micropterus dolomieu', aliases: ['smallmouth', 'smallie', 'smb', 'bronzeback'], ws: { a: -5.329, b: 3.200 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'bass', lengthRangeCm: [10, 68] },
  { id: 'spotted_bass', common: 'Spotted Bass', scientific: 'Micropterus punctulatus', aliases: ['spot', 'kentucky bass'], ws: { a: -5.392, b: 3.215 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'bass', lengthRangeCm: [10, 60] },
  // --- Sunfish / panfish ---
  { id: 'bluegill', common: 'Bluegill', scientific: 'Lepomis macrochirus', aliases: ['bream', 'brim', 'sunny'], ws: { a: -5.374, b: 3.316 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [7, 40] },
  { id: 'redear_sunfish', common: 'Redear Sunfish', scientific: 'Lepomis microlophus', aliases: ['shellcracker', 'redear'], ws: { a: -4.968, b: 3.119 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [8, 43] },
  { id: 'pumpkinseed', common: 'Pumpkinseed', scientific: 'Lepomis gibbosus', aliases: ['punkie', 'sunfish'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [7, 30] },
  { id: 'green_sunfish', common: 'Green Sunfish', scientific: 'Lepomis cyanellus', aliases: ['green sunny'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [7, 31] },
  { id: 'rock_bass', common: 'Rock Bass', scientific: 'Ambloplites rupestris', aliases: ['redeye', 'goggle-eye'], ws: { a: -4.827, b: 3.032 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [8, 43] },
  { id: 'warmouth', common: 'Warmouth', scientific: 'Lepomis gulosus', aliases: ['goggle-eye'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [8, 31] },
  { id: 'black_crappie', common: 'Black Crappie', scientific: 'Pomoxis nigromaculatus', aliases: ['crappie', 'calico', 'speck', 'papermouth'], ws: { a: -5.618, b: 3.345 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [10, 49] },
  { id: 'white_crappie', common: 'White Crappie', scientific: 'Pomoxis annularis', aliases: ['crappie', 'speck', 'papermouth'], ws: { a: -5.642, b: 3.332 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'panfish', lengthRangeCm: [10, 53] },
  // --- Perch / walleye ---
  { id: 'yellow_perch', common: 'Yellow Perch', scientific: 'Perca flavescens', aliases: ['perch', 'ringback'], ws: { a: -5.386, b: 3.230 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [10, 50] },
  { id: 'walleye', common: 'Walleye', scientific: 'Sander vitreus', aliases: ['walleyed pike', "'eye", 'marble eye'], ws: { a: -5.453, b: 3.180 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [15, 91] },
  { id: 'sauger', common: 'Sauger', scientific: 'Sander canadensis', aliases: ['sand pike'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [15, 76] },
  // --- Pike ---
  { id: 'northern_pike', common: 'Northern Pike', scientific: 'Esox lucius', aliases: ['pike', 'northern', 'jack', 'snake'], ws: { a: -5.437, b: 3.096 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'pike', lengthRangeCm: [25, 137] },
  { id: 'muskellunge', common: 'Muskellunge', scientific: 'Esox masquinongy', aliases: ['musky', 'muskie'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'pike', lengthRangeCm: [40, 183] },
  { id: 'chain_pickerel', common: 'Chain Pickerel', scientific: 'Esox niger', aliases: ['pickerel', 'jack'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'pike', lengthRangeCm: [20, 99] },
  // --- Trout / char ---
  { id: 'rainbow_trout', common: 'Rainbow Trout', scientific: 'Oncorhynchus mykiss', aliases: ['rainbow', 'bow', 'steelhead'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [12, 120] },
  { id: 'brown_trout', common: 'Brown Trout', scientific: 'Salmo trutta', aliases: ['brown', 'german brown', 'loch leven'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [12, 105] },
  { id: 'brook_trout', common: 'Brook Trout', scientific: 'Salvelinus fontinalis', aliases: ['brookie', 'speckled trout', 'squaretail'], ws: { a: -5.186, b: 3.103 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [10, 65] },
  { id: 'lake_trout', common: 'Lake Trout', scientific: 'Salvelinus namaycush', aliases: ['laker', 'mackinaw', 'togue'], ws: { a: -5.681, b: 3.246 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [20, 126] },
  { id: 'cutthroat_trout', common: 'Cutthroat Trout', scientific: 'Oncorhynchus clarkii', aliases: ['cutthroat', 'cutty'], ws: { a: -5.189, b: 3.099 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [12, 100] },
  { id: 'tiger_trout', common: 'Tiger Trout', scientific: 'Salmo trutta × Salvelinus fontinalis', aliases: ['tiger'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [15, 80] },
  { id: 'arctic_grayling', common: 'Arctic Grayling', scientific: 'Thymallus arcticus', aliases: ['grayling'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [15, 60] },
  // --- Salmon ---
  { id: 'chinook_salmon', common: 'Chinook Salmon', scientific: 'Oncorhynchus tshawytscha', aliases: ['king salmon', 'king', 'chinook'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [40, 150] },
  { id: 'coho_salmon', common: 'Coho Salmon', scientific: 'Oncorhynchus kisutch', aliases: ['silver salmon', 'silver', 'coho'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [35, 108] },
  { id: 'atlantic_salmon', common: 'Atlantic Salmon', scientific: 'Salmo salar', aliases: ['atlantic', 'salmon'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [40, 150] },
  { id: 'kokanee', common: 'Kokanee', scientific: 'Oncorhynchus nerka', aliases: ['kokanee salmon', 'silver trout', 'sockeye'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [20, 65] },
  // --- Whitefish / cisco ---
  { id: 'lake_whitefish', common: 'Lake Whitefish', scientific: 'Coregonus clupeaformis', aliases: ['whitefish'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [25, 80] },
  { id: 'mountain_whitefish', common: 'Mountain Whitefish', scientific: 'Prosopium williamsoni', aliases: ['whitefish'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [15, 70] },
  { id: 'cisco', common: 'Cisco', scientific: 'Coregonus artedi', aliases: ['tullibee', 'lake herring'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'trout_salmon', lengthRangeCm: [20, 55] },
  { id: 'burbot', common: 'Burbot', scientific: 'Lota lota', aliases: ['eelpout', 'ling', 'lawyer'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'other', lengthRangeCm: [25, 120] },
  // --- Catfish / bullhead ---
  { id: 'channel_catfish', common: 'Channel Catfish', scientific: 'Ictalurus punctatus', aliases: ['channel cat', 'catfish', 'channel'], ws: { a: -5.800, b: 3.294 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'catfish', lengthRangeCm: [15, 132] },
  { id: 'blue_catfish', common: 'Blue Catfish', scientific: 'Ictalurus furcatus', aliases: ['blue cat', 'blue'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'catfish', lengthRangeCm: [20, 165] },
  { id: 'flathead_catfish', common: 'Flathead Catfish', scientific: 'Pylodictis olivaris', aliases: ['flathead', 'shovelhead', 'mud cat', 'yellow cat'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'catfish', lengthRangeCm: [20, 155] },
  { id: 'black_bullhead', common: 'Black Bullhead', scientific: 'Ameiurus melas', aliases: ['bullhead', 'mud cat'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'catfish', lengthRangeCm: [12, 63] },
  { id: 'brown_bullhead', common: 'Brown Bullhead', scientific: 'Ameiurus nebulosus', aliases: ['bullhead', 'horned pout'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'catfish', lengthRangeCm: [12, 55] },
  { id: 'yellow_bullhead', common: 'Yellow Bullhead', scientific: 'Ameiurus natalis', aliases: ['bullhead'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'catfish', lengthRangeCm: [12, 47] },
  // --- Temperate bass ---
  { id: 'white_bass', common: 'White Bass', scientific: 'Morone chrysops', aliases: ['sand bass', 'sandy', 'silver bass'], ws: { a: -5.615, b: 3.340 }, wsSource: BLACKWELL, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [12, 55] },
  { id: 'striped_bass', common: 'Striped Bass', scientific: 'Morone saxatilis', aliases: ['striper', 'rockfish', 'linesider'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [20, 200] },
  { id: 'hybrid_striped_bass', common: 'Hybrid Striped Bass', scientific: 'Morone saxatilis × chrysops', aliases: ['wiper', 'whiterock bass', 'hybrid'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [15, 90] },
  { id: 'white_perch', common: 'White Perch', scientific: 'Morone americana', aliases: ['perch'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'walleye_perch', lengthRangeCm: [10, 49] },
  // --- Carp / drum / gar / bowfin / shad / sturgeon ---
  { id: 'common_carp', common: 'Common Carp', scientific: 'Cyprinus carpio', aliases: ['carp', 'german carp', 'mirror carp'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'carp_sucker', lengthRangeCm: [20, 120] },
  { id: 'grass_carp', common: 'Grass Carp', scientific: 'Ctenopharyngodon idella', aliases: ['white amur', 'carp'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'carp_sucker', lengthRangeCm: [30, 150] },
  { id: 'freshwater_drum', common: 'Freshwater Drum', scientific: 'Aplodinotus grunniens', aliases: ['sheepshead', 'gaspergou', 'drum'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'other', lengthRangeCm: [15, 95] },
  { id: 'bowfin', common: 'Bowfin', scientific: 'Amia calva', aliases: ['dogfish', 'mudfish', 'grinnel'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'pike', lengthRangeCm: [30, 109] },
  { id: 'longnose_gar', common: 'Longnose Gar', scientific: 'Lepisosteus osseus', aliases: ['gar', 'needlenose gar'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'pike', lengthRangeCm: [40, 183] },
  { id: 'shortnose_gar', common: 'Shortnose Gar', scientific: 'Lepisosteus platostomus', aliases: ['gar'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'pike', lengthRangeCm: [30, 88] },
  { id: 'american_shad', common: 'American Shad', scientific: 'Alosa sapidissima', aliases: ['shad', 'white shad'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'other', lengthRangeCm: [30, 76] },
  { id: 'white_sturgeon', common: 'White Sturgeon', scientific: 'Acipenser transmontanus', aliases: ['sturgeon'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'other', lengthRangeCm: [60, 350] },
  { id: 'lake_sturgeon', common: 'Lake Sturgeon', scientific: 'Acipenser fulvescens', aliases: ['sturgeon', 'rock sturgeon'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'other', lengthRangeCm: [50, 240] },
  // --- Catch-all ---
  { id: 'other', common: 'Other / Unknown', scientific: '', aliases: ['unknown', 'unidentified'], ws: null, wsSource: null, wsVerified: false, girthFamily: 'other', lengthRangeCm: [2, 400] },
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string | null | undefined): SpeciesDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function speciesName(id: string | null | undefined): string {
  return speciesById(id)?.common ?? 'Unknown species';
}

/** Case-insensitive search over common name, scientific name, and aliases. */
export function searchSpecies(query: string): SpeciesDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return SPECIES.filter((s) => s.id !== 'other');
  return SPECIES.filter((s) => {
    if (s.common.toLowerCase().includes(q)) return true;
    if (s.scientific.toLowerCase().includes(q)) return true;
    return s.aliases.some((a) => a.toLowerCase().includes(q));
  });
}

/** Ids accepted by the cloud ID tool schema (all real species + 'other'). */
export function allSpeciesIds(): string[] {
  return SPECIES.map((s) => s.id);
}
