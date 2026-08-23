/**
 * Crop advisory knowledge base for the demo crops.
 *
 * Deliberately small and curated rather than a scraped corpus: every entry is
 * a condition a Kharif-season farmer in western/central India plausibly calls
 * about, and each carries the ONE question that separates it from its
 * look-alikes. The agent uses `distinguishingQuestion` to ask something useful
 * instead of guessing between two similar diagnoses.
 *
 * Treatments are described by category only. Dosages are never stated here —
 * that decision belongs to a human agronomist, and the prompt enforces it.
 */

export type Advisory = {
  crop: string;
  /** Hindi name first: it is what the farmer will recognise. */
  condition: string;
  conditionEnglish: string;
  /** Lowercase keywords matched against what the farmer described. */
  symptoms: string[];
  favouredBy: string;
  distinguishingQuestion: string;
  treatmentCategory: string;
  severity: 'low' | 'moderate' | 'high';
};

const KNOWLEDGE_BASE: Advisory[] = [
  // ─── Tomato ────────────────────────────────────────────────────────────────
  {
    crop: 'tomato',
    condition: 'पछेती झुलसा',
    conditionEnglish: 'Late blight',
    symptoms: [
      'dark spots', 'black patches', 'water soaked', 'white growth underside',
      'leaves rotting', 'stem black', 'fruit rot', 'काले धब्बे', 'सड़न',
    ],
    favouredBy: 'cool nights with heavy dew or rain, humidity above 80 percent',
    distinguishingQuestion:
      'Ask whether the spots have a pale green or water-soaked edge, and whether a white fuzzy growth appears on the underside of the leaf in the morning. That indicates late blight rather than early blight.',
    treatmentCategory:
      'protective fungicide spray, plus removing and destroying infected plants',
    severity: 'high',
  },
  {
    crop: 'tomato',
    condition: 'अगेती झुलसा',
    conditionEnglish: 'Early blight',
    symptoms: [
      'brown spots', 'concentric rings', 'target spots', 'yellowing lower leaves',
      'older leaves first', 'भूरे धब्बे', 'पीले पत्ते',
    ],
    favouredBy: 'warm humid weather, alternating wet and dry spells',
    distinguishingQuestion:
      'Ask whether the spots show rings inside them like a target, and whether the oldest lower leaves were affected first. Both point to early blight.',
    treatmentCategory: 'fungicide spray and improved field sanitation',
    severity: 'moderate',
  },
  {
    crop: 'tomato',
    condition: 'पत्ती मरोड़ रोग',
    conditionEnglish: 'Leaf curl virus',
    symptoms: [
      'curling leaves', 'upward curling', 'stunted', 'small leaves',
      'whitefly', 'no fruit', 'मरोड़', 'सफेद मक्खी',
    ],
    favouredBy: 'hot dry weather with high whitefly population',
    distinguishingQuestion:
      'Ask whether he sees tiny white insects flying up when he disturbs the plant. Leaf curl virus is spread by whitefly, so controlling the insect matters more than treating the leaf.',
    treatmentCategory:
      'whitefly management and removal of infected plants; the virus itself cannot be cured',
    severity: 'high',
  },

  // ─── Cotton ────────────────────────────────────────────────────────────────
  {
    crop: 'cotton',
    condition: 'गुलाबी सुंडी',
    conditionEnglish: 'Pink bollworm',
    symptoms: [
      'holes in bolls', 'rosette flower', 'damaged bolls', 'pink larvae',
      'boll drop', 'सुंडी', 'गुलाबी कीड़ा', 'फूल खराब',
    ],
    favouredBy: 'late-season crop, staggered sowing, previous-year infestation',
    distinguishingQuestion:
      'Ask him to open one affected boll and say what he sees inside. Pink larvae inside the boll confirm pink bollworm.',
    treatmentCategory:
      'pheromone traps, timely harvest, and destruction of affected bolls',
    severity: 'high',
  },
  {
    crop: 'cotton',
    condition: 'सफेद मक्खी',
    conditionEnglish: 'Whitefly',
    symptoms: [
      'sticky leaves', 'black sooty mould', 'yellowing', 'white insects',
      'honeydew', 'चिपचिपा', 'सफेद मक्खी',
    ],
    favouredBy: 'hot dry spells, excess nitrogen fertiliser',
    distinguishingQuestion:
      'Ask whether the leaves feel sticky to touch and whether a black coating has formed on them. Sticky leaves with black mould indicate whitefly honeydew.',
    treatmentCategory: 'yellow sticky traps and appropriate insecticide rotation',
    severity: 'moderate',
  },

  // ─── Wheat ─────────────────────────────────────────────────────────────────
  {
    crop: 'wheat',
    condition: 'पीला रतुआ',
    conditionEnglish: 'Yellow rust',
    symptoms: [
      'yellow stripes', 'yellow powder', 'rust on leaves', 'stripes on leaves',
      'powder on hands', 'पीली धारी', 'रतुआ',
    ],
    favouredBy: 'cool moist weather, 10 to 20 degrees, common in north India',
    distinguishingQuestion:
      'Ask whether yellow powder comes off on his fingers when he touches the leaf, and whether it forms stripes running along the leaf. Both confirm yellow rust.',
    treatmentCategory: 'immediate fungicide spray; it spreads very fast',
    severity: 'high',
  },

  // ─── Paddy / rice ──────────────────────────────────────────────────────────
  {
    crop: 'paddy',
    condition: 'झोंका रोग',
    conditionEnglish: 'Rice blast',
    symptoms: [
      'diamond shaped spots', 'spindle shaped', 'grey centre', 'neck rot',
      'broken neck', 'धब्बे', 'झोंका',
    ],
    favouredBy: 'high humidity, cloudy weather, excess nitrogen',
    distinguishingQuestion:
      'Ask about the shape of the spots. Blast makes diamond or eye-shaped spots with a grey centre and brown border.',
    treatmentCategory: 'fungicide spray and balanced nitrogen use',
    severity: 'high',
  },
  {
    crop: 'paddy',
    condition: 'भूरा फुदका',
    conditionEnglish: 'Brown planthopper',
    symptoms: [
      'hopper burn', 'drying patches', 'circular patches', 'insects at base',
      'plants drying', 'फुदका', 'सूख रहा',
    ],
    favouredBy: 'dense planting, standing water, humid conditions',
    distinguishingQuestion:
      'Ask him to part the plants and look at the base near the water line for small brown insects. Drying in circular patches with insects at the base indicates planthopper.',
    treatmentCategory: 'draining the field temporarily and targeted insecticide',
    severity: 'high',
  },
];

/** Crops this knowledge base actually covers. */
export const SUPPORTED_CROPS = [...new Set(KNOWLEDGE_BASE.map((a) => a.crop))];

const normalise = (value: string) => value.toLowerCase().trim();

/**
 * The agent passes the crop as the farmer said it, which is usually Hindi.
 * Mapping those to the keys used above saves a failed call and a retry — and
 * on a voice call, a wasted round trip is a second of silence.
 */
const CROP_ALIASES: Record<string, string> = {
  टमाटर: 'tomato', tamatar: 'tomato',
  कपास: 'cotton', कपस: 'cotton', kapas: 'cotton', रुई: 'cotton',
  गेहूं: 'wheat', गेहूँ: 'wheat', gehun: 'wheat', gehu: 'wheat',
  धान: 'paddy', चावल: 'paddy', dhan: 'paddy', rice: 'paddy', chawal: 'paddy',
};

/** Resolves a spoken crop name to a knowledge-base key. */
function resolveCrop(value: string): string {
  const key = normalise(value);
  if (CROP_ALIASES[key]) return CROP_ALIASES[key];

  // Handle phrases like "टमाटर की फसल" or "tomato crop".
  for (const [alias, crop] of Object.entries(CROP_ALIASES)) {
    if (key.includes(alias)) return crop;
  }
  return key;
}

/**
 * Scores entries by crop match plus symptom keyword overlap. Returns the best
 * matches with their score so the caller can tell the agent how confident to
 * sound — a weak match must not be reported as a diagnosis.
 */
export function searchAdvisory(
  crop: string,
  symptoms: string,
  limit = 3,
): Array<Advisory & { matchScore: number }> {
  const cropKey = resolveCrop(crop);
  const described = normalise(symptoms);

  return KNOWLEDGE_BASE.map((advisory) => {
    const cropMatches =
      cropKey.includes(advisory.crop) || advisory.crop.includes(cropKey);

    const hits = advisory.symptoms.filter((symptom) =>
      described.includes(normalise(symptom)),
    ).length;

    // Crop match is worth more than any single symptom, but symptoms alone can
    // still surface a candidate when the crop name was misheard.
    return { ...advisory, matchScore: (cropMatches ? 3 : 0) + hits };
  })
    .filter((advisory) => advisory.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}
