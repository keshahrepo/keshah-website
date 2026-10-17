/**
 * Verified science facts, the ONLY facts content scripts may use (content-writer.ts).
 * Generated 2026-10-17 from the facts research (abstracts / PMC full texts via NCBI E-utilities).
 * line: what a creator may say (meaning kept verbatim). never: what must never be said. source: short cite.
 * Versioned in code on purpose: change a fact here, in review, never at runtime.
 */

export interface ContentFact {
  id: string;
  line: string;
  never: string;
  source: string;
}

export const CONTENT_FACTS: readonly ContentFact[] = [
  {
    id: "F01_tension_pattern_model",
    line: "One study built a computer model of the scalp and found the spots under the most tension lined up closely with where men usually go bald.",
    never: "Never say this study proved tension causes baldness, or that it measured real men's scalps.",
    source: "Tellez-Segura R, International Journal of Trichology, 2015",
  },
  {
    id: "F02_lower_blood_flow_balding",
    line: "One small study found that men who were starting to go bald had about two and a half times less blood flow in their scalp than men with full hair.",
    never: "Never say low blood flow is proven to cause baldness, or that this study showed massage fixes it.",
    source: "Klemp P et al., Journal of Investigative Dermatology, 1989",
  },
  {
    id: "F03_oxygen_bald_scalp",
    line: "One small study found the bald front of the scalp had less oxygen than the sides of the head where hair was still growing.",
    never: "Never say your follicles are suffocating or starving, and never claim this proves the cause of baldness.",
    source: "Goldman BE et al., Plastic and Reconstructive Surgery, 1996",
  },
  {
    id: "F04_koyama_massage_thickness",
    line: "One small study found that four minutes of scalp massage a day for about six months made hair a little thicker in healthy men.",
    never: "Never say massage was proven to regrow hair or increase hair count (the hair count actually dipped), and never say the men were balding.",
    source: "Koyama T et al., Eplasty, 2016",
  },
  {
    id: "F05_stretch_dermal_papilla",
    line: "In the lab, scientists found that stretching the cells at the base of the hair follicle changed a lot of genes linked to how hair grows.",
    never: "Never say massage switches on hair growth genes in your scalp.",
    source: "Koyama T et al., Eplasty, 2016",
  },
  {
    id: "F06_english_survey",
    line: "In one survey of a few hundred people doing daily scalp massage, about seven in ten said their hair loss stopped or got better, but that was self-reported.",
    never: "Never say 69% regrew their hair, never say 7 in 10 people are guaranteed results, and never call it a clinical trial.",
    source: "English RS Jr et al., Dermatology and Therapy, 2019",
  },
  {
    id: "F07_toshitani_tension_device",
    line: "One older study found that a device that eased tension on the top of the scalp went along with more blood flow in the scalp.",
    never: "Never quote the 40% regrowth number, and never say easing tension is proven to regrow hair.",
    source: "Toshitani S et al., Journal of Dermatology, 1990",
  },
  {
    id: "F08_minoxidil_blood_flow",
    line: "One study found minoxidil can boost blood flow in a balding scalp for a short time, which may be part of how it works.",
    never: "Never say minoxidil works only by blood flow, or that massage does the same thing as minoxidil.",
    source: "Wester RC et al., Journal of Investigative Dermatology, 1984",
  },
  {
    id: "F09_minoxidil_mechanism_review",
    line: "Minoxidil was first a blood pressure drug that opens up blood vessels, and scientists think that may be part of how it helps hair, but they are still not sure exactly how it works.",
    never: "Never say science has proven minoxidil works by increasing blood flow.",
    source: "Messenger AG et al., British Journal of Dermatology, 2004",
  },
  {
    id: "F10_vegf_vessels_follicle_size",
    line: "In mice, scientists found that more blood vessels around the hair follicle meant thicker, faster growing hair.",
    never: "Never say this proves more blood flow regrows hair in people.",
    source: "Yano K et al., Journal of Clinical Investigation, 2001",
  },
  {
    id: "F11_occipital_vs_frontal_DP",
    line: "Lab research shows hair cells from the back of the head respond to hormones differently than cells from the balding front, which helps explain why the back usually keeps its hair.",
    never: "Never say this study showed tension makes follicles sensitive to DHT.",
    source: "Inui S et al., Journal of Investigative Dermatology, 2007",
  },
  {
    id: "F12_botox_meta_analysis",
    line: "Some doctors have tried relaxing the muscles around the scalp with botox for hair loss, and the results so far are mixed.",
    never: "Never say botox is proven to stop hair loss, or that relaxing scalp muscles is a proven fix.",
    source: "Cheng F et al., Dermatologic Surgery, 2025",
  },
  {
    id: "F13_galea_layers_anatomy",
    line: "Under your scalp skin there is a tough sheet called the galea, and the muscles of your forehead and the back of your head pull on it.",
    never: "Never say the galea strangles or chokes your follicles.",
    source: "Tajran J, Gosman AA, StatPearls, 2023",
  },
  {
    id: "F14_auricular_muscles",
    line: "The little muscles above and in front of your ears actually attach to the same tough sheet that covers the top of your head.",
    never: "Never say ear muscles cause baldness, or that wiggling your ears regrows hair.",
    source: "Standring (ed.), Gray's Anatomy 41st ed., 2016",
  },
  {
    id: "F15_temporalis",
    line: "The muscle on the side of your head is a chewing muscle, so clenching your jaw tightens the side of your head too.",
    never: "Never say jaw clenching is proven to cause hair loss.",
    source: "Okoń A et al., BioMed Research International, 2026",
  },
  {
    id: "F16_forward_head_posture",
    line: "Research shows adults with neck pain often hold their head further forward, so posture is worth paying attention to.",
    never: "Never say forward head posture causes hair loss, or that it was shown to tighten the scalp.",
    source: "Mahmoud NF et al., Current Reviews in Musculoskeletal Medicine, 2019",
  },
];

const BY_ID = new Map(CONTENT_FACTS.map((f) => [f.id, f]));

export function factById(id: string | null | undefined): ContentFact | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}
