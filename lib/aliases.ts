// Canonical values and known spelling variants. Shared by data cleaning and the rule-based question parser.

const TLV = "תל אביב-יפו";
const MODIIN = "מודיעין-מכבים-רעות";

export const CITIES = [
  "אשדוד", "באר שבע", "בית שמש", "בת ים", "גבעתיים", "הרצליה", "חולון", "חיפה", "ירושלים",
  "כפר סבא", MODIIN, "נתניה", "פתח תקווה", "ראשון לציון", "רחובות", "רמת גן", "רעננה", TLV,
];

export const cityKey = (s: string) =>
  s.trim().toLowerCase().replace(/״/g, '"').replace(/[-–]/g, " ").replace(/\s+/g, " ");

export const CITY_ALIASES = new Map<string, string>([
  ...CITIES.map((c): [string, string] => [cityKey(c), c]),
  ["תל אביב", TLV], ['ת"א', TLV], ["tel aviv", TLV], ["tel aviv yafo", TLV],
  ["jerusalem", "ירושלים"],
  ['ב"ש', "באר שבע"],
  ['כ"ס', "כפר סבא"], ['ר"ג', "רמת גן"], ['פ"ת', "פתח תקווה"], ['ראשל"צ', "ראשון לציון"], ["פתח תקוה", "פתח תקווה"],
  ["מודיעין", MODIIN],
]);

export const canonicalCity = (raw: string) => CITY_ALIASES.get(cityKey(raw));

// Neighborhood spellings found in the data, keyed by the variant.
export const NEIGHBORHOOD_ALIASES = new Map([["florentin", "פלורנטין"]]);

export const PROPERTY_TYPES = ["דירה", "דופלקס", "פנטהאוז", "דירת גן", "דירת גג", "בית פרטי"];
export const CONDITIONS = ["חדש מקבלן", "משופץ", "במצב טוב", "שמור", "דורש שיפוץ"];
// Precedence order for conflicting reports of the same deal: the tax authority records the actual transaction.
export const SOURCES = ["רשות המסים", "מתווך", "בעל נכס"];

export const TRUE_WORDS = ["כן", "yes", "true", "1"];
export const FALSE_WORDS = ["לא", "no", "false", "0"];

// Places a user may ask about that the dataset doesn't cover: answered with an explicit "no data", never a country-wide answer.
export const OTHER_PLACES = [
  "אילת", "עפולה", "טבריה", "נצרת", "הוד השרון", "כפר יונה", "קריית גת", "קריית שמונה", "קריית אתא", "קריית ביאליק",
  "קריית מוצקין", "קריית ים", "קריית אונו", "קריית מלאכי", "אשקלון", "נהריה", "עכו", "כרמיאל", "צפת", "דימונה", "ערד",
  "אופקים", "שדרות", "נתיבות", "יבנה", "נס ציונה", "לוד", "רמלה", "ראש העין", "אור יהודה", "יהוד", "בני ברק", "אלעד",
  "ביתר עילית", "מעלה אדומים", "אריאל", "זכרון יעקב", "חדרה", "קיסריה", "פרדס חנה", "טירת כרמל", "נשר", "יקנעם",
  "מגדל העמק", "בית שאן", "רהט", "רמת השרון", "גבעת שמואל",
];
