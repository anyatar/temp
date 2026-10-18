// Canonical values and known spelling variants. Shared by data cleaning and the rule-based question parser.

const TLV = "תל אביב-יפו";
const MODIIN = "מודיעין-מכבים-רעות";

export const CITIES = [
  "אשדוד", "באר שבע", "בית שמש", "בת ים", "גבעתיים", "הרצליה", "חולון", "חיפה", "ירושלים",
  "כפר סבא", MODIIN, "נתניה", "פתח תקווה", "ראשון לציון", "רחובות", "רמת גן", "רעננה", TLV,
];

const cityKey = (s: string) =>
  s.trim().toLowerCase().replace(/״/g, '"').replace(/[-–]/g, " ").replace(/\s+/g, " ");

const CITY_ALIASES = new Map<string, string>([
  ...CITIES.map((c): [string, string] => [cityKey(c), c]),
  ["תל אביב", TLV], ['ת"א', TLV], ["tel aviv", TLV], ["tel aviv yafo", TLV],
  ["jerusalem", "ירושלים"],
  ['ב"ש', "באר שבע"],
  ["מודיעין", MODIIN],
]);

export const canonicalCity = (raw: string) => CITY_ALIASES.get(cityKey(raw));

export const PROPERTY_TYPES = ["דירה", "דופלקס", "פנטהאוז", "דירת גן", "דירת גג", "בית פרטי"];
export const CONDITIONS = ["חדש מקבלן", "משופץ", "במצב טוב", "שמור", "דורש שיפוץ"];
// Precedence order for conflicting reports of the same deal: the tax authority records the actual transaction.
export const SOURCES = ["רשות המסים", "מתווך", "בעל נכס"];

export const TRUE_WORDS = ["כן", "yes", "true", "1"];
export const FALSE_WORDS = ["לא", "no", "false", "0"];
