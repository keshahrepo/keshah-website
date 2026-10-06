/**
 * Validation for creator bank details and tax forms. Pure functions, safe on
 * both the server (the API re-checks everything) and the client (instant
 * feedback in the portal forms).
 *
 * Every error message is plain spoken copy for the creator.
 */

export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const squash = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");

// ---------------------------------------------------------------- bank

export type AccountType = "checking" | "savings";

export interface BankDetails {
  account_holder: string;
  bank_name: string;
  routing_number: string;
  account_number: string;
  account_type: AccountType;
}

/** ABA routing number: 9 digits, valid 3-7-1 checksum, real Fed prefix. */
export function isValidRoutingNumber(raw: unknown): boolean {
  const d = String(raw ?? "").trim();
  if (!/^\d{9}$/.test(d)) return false;
  const prefix = Number(d.slice(0, 2));
  const prefixOk = (prefix >= 0 && prefix <= 12) || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80;
  if (!prefixOk || d === "000000000") return false;
  const n = d.split("").map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

export function isValidAccountNumber(raw: unknown): boolean {
  return /^\d{4,17}$/.test(String(raw ?? "").trim());
}

export function validateBank(input: Partial<Record<keyof BankDetails, unknown>> & { account_number_confirm?: unknown }):
  | { ok: true; bank: BankDetails }
  | { ok: false; error: string; field: string } {
  const account_holder = squash(input.account_holder);
  const bank_name = squash(input.bank_name);
  const routing = String(input.routing_number ?? "").replace(/[\s-]/g, "");
  const account = String(input.account_number ?? "").replace(/[\s-]/g, "");
  const confirm = String(input.account_number_confirm ?? "").replace(/[\s-]/g, "");
  if (account_holder.length < 2 || account_holder.length > 120)
    return { ok: false, field: "account_holder", error: "Add the name on the bank account." };
  if (bank_name.length < 2 || bank_name.length > 120) return { ok: false, field: "bank_name", error: "Add the name of your bank." };
  if (!isValidRoutingNumber(routing))
    return { ok: false, field: "routing_number", error: "That routing number doesn't look right. It's the 9 digits at the bottom left of a check." };
  if (!isValidAccountNumber(account))
    return { ok: false, field: "account_number", error: "Your account number should be between 4 and 17 digits, numbers only." };
  if (input.account_number_confirm !== undefined && confirm !== account)
    return { ok: false, field: "account_number_confirm", error: "The two account numbers don't match. Type it again in both boxes." };
  if (input.account_type !== "checking" && input.account_type !== "savings")
    return { ok: false, field: "account_type", error: "Pick checking or savings." };
  return { ok: true, bank: { account_holder, bank_name, routing_number: routing, account_number: account, account_type: input.account_type } };
}

// ---------------------------------------------------------------- TINs

/** SSN, or an ITIN (resident aliens put their ITIN in the W-9 SSN box). */
export function isValidSsnOrItin(raw: unknown): boolean {
  const d = String(raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(d)) return false;
  const area = d.slice(0, 3);
  const group = Number(d.slice(3, 5));
  const serial = d.slice(5);
  if (area.startsWith("9")) {
    // ITIN: middle digits 50-65, 70-88, 90-92, 94-99.
    return (group >= 50 && group <= 65) || (group >= 70 && group <= 88) || (group >= 90 && group <= 92) || (group >= 94 && group <= 99);
  }
  if (area === "000" || area === "666") return false;
  if (group === 0 || serial === "0000") return false;
  if (/^(\d)\1{8}$/.test(d) || d === "123456789") return false;
  return true;
}

/** Prefixes the IRS has never issued for EINs. */
const BAD_EIN_PREFIXES = new Set(["00", "07", "08", "09", "17", "18", "19", "28", "29", "49", "69", "70", "78", "79", "89", "96", "97"]);

export function isValidEin(raw: unknown): boolean {
  const d = String(raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(d)) return false;
  if (BAD_EIN_PREFIXES.has(d.slice(0, 2))) return false;
  return !/^(\d)\1{8}$/.test(d);
}

export const last4 = (s: string) => s.replace(/[\s-]/g, "").slice(-4);

// ---------------------------------------------------------------- W-9 (Rev. March 2024)

export const W9_REVISION = "Form W-9 (Rev. March 2024)";
export const W8BEN_REVISION = "Form W-8BEN (Rev. October 2021)";

export const W9_CLASSIFICATIONS = [
  ["individual", "Individual or sole proprietor"],
  ["c_corp", "C corporation"],
  ["s_corp", "S corporation"],
  ["partnership", "Partnership"],
  ["trust", "Trust or estate"],
  ["llc", "LLC"],
  ["other", "Other"],
] as const;
export type W9Classification = (typeof W9_CLASSIFICATIONS)[number][0];

export interface W9Input {
  name: string;
  business_name: string;
  classification: W9Classification;
  /** LLC tax classification: C, S or P. */
  llc_code: "" | "C" | "S" | "P";
  other_text: string;
  /** Line 3b. Only for partnership / trust / LLC taxed as P. */
  foreign_partners: boolean;
  exempt_payee_code: string;
  fatca_code: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  tin_type: "ssn" | "ein";
  tin: string;
  /** Ticked: the IRS told them they're subject to backup withholding (item 2 gets crossed out). */
  backup_withholding: boolean;
}

/** Part II, verbatim from the form. */
export const W9_CERTIFICATION = [
  "Under penalties of perjury, I certify that:",
  "1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and",
  "2. I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and",
  "3. I am a U.S. citizen or other U.S. person (defined below); and",
  "4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.",
];
export const W9_CERTIFICATION_INSTRUCTIONS =
  "Certification instructions. You must cross out item 2 above if you have been notified by the IRS that you are currently subject to backup withholding because you have failed to report all interest and dividends on your tax return. For real estate transactions, item 2 does not apply. For mortgage interest paid, acquisition or abandonment of secured property, cancellation of debt, contributions to an individual retirement arrangement (IRA), and, generally, payments other than interest and dividends, you are not required to sign the certification, but you must provide your correct TIN. See the instructions for Part II, later.";
/** Required on electronic Forms W-9 (Instructions for the Requester of Form W-9). */
export const IRS_CONSENT_STATEMENT =
  "The Internal Revenue Service does not require your consent to any provision of this document other than the certifications required to avoid backup withholding.";

/** Part III, verbatim from the form. */
export const W8BEN_CERTIFICATION = [
  "Under penalties of perjury, I declare that I have examined the information on this form and to the best of my knowledge and belief it is true, correct, and complete. I further certify under penalties of perjury that:",
  "• I am the individual that is the beneficial owner (or am authorized to sign for the individual that is the beneficial owner) of all the income or proceeds to which this form relates or am using this form to document myself for chapter 4 purposes;",
  "• The person named on line 1 of this form is not a U.S. person;",
  "• This form relates to:",
  "(a) income not effectively connected with the conduct of a trade or business in the United States;",
  "(b) income effectively connected with the conduct of a trade or business in the United States but is not subject to tax under an applicable income tax treaty;",
  "(c) the partner’s share of a partnership’s effectively connected taxable income; or",
  "(d) the partner’s amount realized from the transfer of a partnership interest subject to withholding under section 1446(f);",
  "• The person named on line 1 of this form is a resident of the treaty country listed on line 9 of the form (if any) within the meaning of the income tax treaty between the United States and that country; and",
  "• For broker transactions or barter exchanges, the beneficial owner is an exempt foreign person as defined in the instructions.",
  "Furthermore, I authorize this form to be provided to any withholding agent that has control, receipt, or custody of the income of which I am the beneficial owner or any withholding agent that can disburse or make payments of the income of which I am the beneficial owner. I agree that I will submit a new form within 30 days if any certification made on this form becomes incorrect.",
];
export const W8BEN_CAPACITY = "I certify that I have the capacity to sign for the person identified on line 1 of this form.";

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","AS","GU","MP","PR","VI","AA","AE","AP",
];

type Result<T> = { ok: true; value: T } | { ok: false; error: string; field: string };
const bad = (field: string, error: string) => ({ ok: false as const, field, error });
const str = (v: unknown, max = 120) => squash(v).slice(0, max);

export function validateW9(raw: Partial<Record<keyof W9Input, unknown>>): Result<W9Input> {
  const name = str(raw.name);
  if (name.length < 2) return bad("name", "Add your name exactly as it appears on your tax return.");
  const business_name = str(raw.business_name);
  const classification = W9_CLASSIFICATIONS.some(([k]) => k === raw.classification) ? (raw.classification as W9Classification) : null;
  if (!classification) return bad("classification", "Pick your federal tax classification.");
  const llc_code = classification === "llc" ? (String(raw.llc_code ?? "").toUpperCase() as W9Input["llc_code"]) : "";
  if (classification === "llc" && !["C", "S", "P"].includes(llc_code)) return bad("llc_code", "Pick how your LLC is taxed: C, S or P.");
  const other_text = classification === "other" ? str(raw.other_text, 60) : "";
  if (classification === "other" && other_text.length < 2) return bad("other_text", "Say what your tax classification is.");
  const flowThrough = classification === "partnership" || classification === "trust" || (classification === "llc" && llc_code === "P");
  const exempt_payee_code = str(raw.exempt_payee_code, 4);
  const fatca_code = str(raw.fatca_code, 4).toUpperCase();
  if (exempt_payee_code && !/^([1-9]|1[0-3])$/.test(exempt_payee_code)) return bad("exempt_payee_code", "Exempt payee codes are 1 to 13. Leave it blank if you're not sure.");
  if (fatca_code && !/^[A-M]$/.test(fatca_code)) return bad("fatca_code", "FATCA codes are a single letter, A to M. Leave it blank if you're not sure.");
  const address = str(raw.address, 150);
  if (address.length < 4) return bad("address", "Add your street address.");
  const city = str(raw.city, 60);
  if (city.length < 2) return bad("city", "Add your city.");
  const state = str(raw.state, 2).toUpperCase();
  if (!US_STATES.includes(state)) return bad("state", "Pick your state.");
  const zip = String(raw.zip ?? "").trim();
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return bad("zip", "Add a 5 digit ZIP code.");
  const tin_type = raw.tin_type === "ein" ? "ein" : "ssn";
  const tin = digits(raw.tin);
  if (tin_type === "ssn" && !isValidSsnOrItin(tin)) return bad("tin", "That Social Security number doesn't look right. It should be 9 digits.");
  if (tin_type === "ein" && !isValidEin(tin)) return bad("tin", "That EIN doesn't look right. It should be 9 digits.");
  return {
    ok: true,
    value: {
      name,
      business_name,
      classification,
      llc_code,
      other_text,
      foreign_partners: flowThrough && raw.foreign_partners === true,
      exempt_payee_code,
      fatca_code,
      address,
      city,
      state,
      zip,
      tin_type,
      tin,
      backup_withholding: raw.backup_withholding === true,
    },
  };
}

// ---------------------------------------------------------------- W-8BEN (Rev. October 2021)

export interface W8benInput {
  name: string;
  citizenship: string;
  address: string;
  city: string;
  country: string;
  mailing_address: string;
  mailing_city: string;
  mailing_country: string;
  /** Optional US SSN/ITIN (line 5). */
  us_tin: string;
  /** "have": ftin filled in. "not_required": box 6b. "none": no FTIN, reason given. */
  ftin_status: "have" | "not_required" | "none";
  ftin: string;
  ftin_reason: string;
  /** yyyy-mm-dd from the date input; printed MM-DD-YYYY. */
  dob: string;
  claim_treaty: boolean;
  treaty_country: string;
  treaty_article: string;
  treaty_rate: string;
  treaty_income_type: string;
  treaty_conditions: string;
}

const US_NAMES = new Set(["us", "u.s.", "usa", "u.s.a.", "united states", "united states of america", "america"]);
export const isUsCountry = (s: string) => US_NAMES.has(s.trim().toLowerCase());

export function validateW8ben(raw: Partial<Record<keyof W8benInput, unknown>>, now = new Date()): Result<W8benInput> {
  const name = str(raw.name);
  if (name.length < 2) return bad("name", "Add your full name.");
  const citizenship = str(raw.citizenship, 60);
  if (citizenship.length < 2) return bad("citizenship", "Add your country of citizenship.");
  if (isUsCountry(citizenship)) return bad("citizenship", "US citizens fill in a W-9 instead. Go back and pick yes.");
  const address = str(raw.address, 150);
  if (address.length < 4) return bad("address", "Add your home street address. A P.O. box won't work here.");
  if (/\bp\.?\s?o\.?\s*box\b/i.test(address)) return bad("address", "This has to be your home address, not a P.O. box.");
  const city = str(raw.city, 80);
  if (city.length < 2) return bad("city", "Add your city, region and postal code.");
  const country = str(raw.country, 60);
  if (country.length < 2) return bad("country", "Add the country you live in.");
  if (isUsCountry(country)) return bad("country", "If you live in the US for tax purposes, fill in a W-9 instead.");
  const mailing_address = str(raw.mailing_address, 150);
  const mailing_city = mailing_address ? str(raw.mailing_city, 80) : "";
  const mailing_country = mailing_address ? str(raw.mailing_country, 60) : "";
  if (mailing_address && (mailing_city.length < 2 || mailing_country.length < 2))
    return bad("mailing_city", "Finish your mailing address, or leave it all blank if it's the same as your home.");
  const us_tin = digits(raw.us_tin);
  if (us_tin && !isValidSsnOrItin(us_tin)) return bad("us_tin", "That US tax number doesn't look right. Leave it blank if you don't have one.");
  const ftin_status = raw.ftin_status === "not_required" || raw.ftin_status === "none" ? raw.ftin_status : "have";
  const ftin = ftin_status === "have" ? str(raw.ftin, 30) : "";
  if (ftin_status === "have" && !/^[A-Za-z0-9][A-Za-z0-9 .\-/]{2,29}$/.test(ftin))
    return bad("ftin", "Add your tax number from your country, for example your NIF or DNI in Spain.");
  const ftin_reason = ftin_status === "none" ? str(raw.ftin_reason, 120) : "";
  if (ftin_status === "none" && ftin_reason.length < 5) return bad("ftin_reason", "Say in a few words why you don't have a tax number.");
  const dob = String(raw.dob ?? "").trim();
  const d = new Date(`${dob}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dob)
    return bad("dob", "Add your date of birth.");
  const age = (now.getTime() - d.getTime()) / (365.25 * 86400000);
  if (age < 13 || age > 120) return bad("dob", "Check your date of birth.");
  const claim_treaty = raw.claim_treaty === true;
  const treaty_country = claim_treaty ? str(raw.treaty_country, 60) : "";
  if (claim_treaty && treaty_country.length < 2) return bad("treaty_country", "Add the treaty country, or untick the treaty claim.");
  return {
    ok: true,
    value: {
      name,
      citizenship,
      address,
      city,
      country,
      mailing_address,
      mailing_city,
      mailing_country,
      us_tin,
      ftin_status,
      ftin,
      ftin_reason,
      dob,
      claim_treaty,
      treaty_country,
      treaty_article: claim_treaty ? str(raw.treaty_article, 40) : "",
      treaty_rate: claim_treaty ? str(raw.treaty_rate, 6) : "",
      treaty_income_type: claim_treaty ? str(raw.treaty_income_type, 80) : "",
      treaty_conditions: claim_treaty ? str(raw.treaty_conditions, 160) : "",
    },
  };
}

/** Typed signature check: the signer types their full name. Individuals must match line 1. */
export function checkSignature(typed: unknown, nameOnForm: string, mustMatch: boolean): string | null {
  const t = squash(typed);
  if (t.length < 2 || t.length > 120) return "Type your full name to sign.";
  if (mustMatch && t.toLowerCase() !== nameOnForm.trim().toLowerCase())
    return `Type your name exactly as it is on line 1: ${nameOnForm}.`;
  return null;
}
