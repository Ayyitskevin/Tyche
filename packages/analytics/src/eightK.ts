import type { Filing } from '@tyche/contracts';

/**
 * 8-K material-events analytics: decode the SEC Form 8-K item taxonomy that
 * filers tag on each current report, and group a company's filings into a
 * material-events timeline. Descriptive only — a labeled view of *reported*
 * filings, never a signal or investment advice. Dependency-free.
 */

// Coarse categories for the item taxonomy. The per-item `label` is the
// authoritative SEC text; the category is a display grouping only.
const CAT_BUSINESS = 'Business & Operations';
const CAT_RESULTS = 'Financial Results';
const CAT_MA = 'M&A / Assets';
const CAT_DEBT = 'Debt & Obligations';
const CAT_SECURITIES = 'Securities & Listing';
const CAT_ACCOUNTING = 'Accounting';
const CAT_GOVERNANCE = 'Management & Governance';
const CAT_ABS = 'Asset-Backed Securities';
const CAT_REG_FD = 'Regulation FD';
const CAT_OTHER_EVENTS = 'Other Events';
const CAT_EXHIBITS = 'Exhibits';
const CAT_UNKNOWN = 'Other';

/** The SEC Form 8-K item taxonomy: code → authoritative label + display category. */
export const EIGHT_K_ITEMS: Record<string, { label: string; category: string }> = {
  '1.01': { label: 'Entry into a Material Definitive Agreement', category: CAT_BUSINESS },
  '1.02': { label: 'Termination of a Material Definitive Agreement', category: CAT_BUSINESS },
  '1.03': { label: 'Bankruptcy or Receivership', category: CAT_BUSINESS },
  '1.04': { label: 'Mine Safety — Reporting of Shutdowns and Patterns of Violations', category: CAT_BUSINESS },
  '1.05': { label: 'Material Cybersecurity Incidents', category: CAT_BUSINESS },
  '2.01': { label: 'Completion of Acquisition or Disposition of Assets', category: CAT_MA },
  '2.02': { label: 'Results of Operations and Financial Condition', category: CAT_RESULTS },
  '2.03': {
    label: 'Creation of a Direct Financial Obligation or an Obligation under an Off-Balance Sheet Arrangement',
    category: CAT_DEBT,
  },
  '2.04': {
    label: 'Triggering Events That Accelerate or Increase a Direct Financial Obligation',
    category: CAT_DEBT,
  },
  '2.05': { label: 'Costs Associated with Exit or Disposal Activities', category: CAT_MA },
  '2.06': { label: 'Material Impairments', category: CAT_MA },
  '3.01': {
    label: 'Notice of Delisting or Failure to Satisfy a Continued Listing Rule or Standard; Transfer of Listing',
    category: CAT_SECURITIES,
  },
  '3.02': { label: 'Unregistered Sales of Equity Securities', category: CAT_SECURITIES },
  '3.03': { label: 'Material Modification to Rights of Security Holders', category: CAT_SECURITIES },
  '4.01': { label: "Changes in Registrant's Certifying Accountant", category: CAT_ACCOUNTING },
  '4.02': {
    label: 'Non-Reliance on Previously Issued Financial Statements or a Related Audit Report or Completed Interim Review',
    category: CAT_ACCOUNTING,
  },
  '5.01': { label: 'Changes in Control of Registrant', category: CAT_GOVERNANCE },
  '5.02': {
    label:
      'Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers',
    category: CAT_GOVERNANCE,
  },
  '5.03': { label: 'Amendments to Articles of Incorporation or Bylaws; Change in Fiscal Year', category: CAT_GOVERNANCE },
  '5.04': { label: "Temporary Suspension of Trading Under Registrant's Employee Benefit Plans", category: CAT_GOVERNANCE },
  '5.05': {
    label: "Amendment to Registrant's Code of Ethics, or Waiver of a Provision of the Code of Ethics",
    category: CAT_GOVERNANCE,
  },
  '5.06': { label: 'Change in Shell Company Status', category: CAT_GOVERNANCE },
  '5.07': { label: 'Submission of Matters to a Vote of Security Holders', category: CAT_GOVERNANCE },
  '5.08': { label: 'Shareholder Director Nominations', category: CAT_GOVERNANCE },
  '6.01': { label: 'ABS Informational and Computational Material', category: CAT_ABS },
  '6.02': { label: 'Change of Servicer or Trustee', category: CAT_ABS },
  '6.03': { label: 'Change in Credit Enhancement or Other External Support', category: CAT_ABS },
  '6.04': { label: 'Failure to Make a Required Distribution', category: CAT_ABS },
  '6.05': { label: 'Securities Act Updating Disclosure', category: CAT_ABS },
  '6.06': { label: 'Static Pool', category: CAT_ABS },
  '7.01': { label: 'Regulation FD Disclosure', category: CAT_REG_FD },
  '8.01': { label: 'Other Events', category: CAT_OTHER_EVENTS },
  '9.01': { label: 'Financial Statements and Exhibits', category: CAT_EXHIBITS },
};

export interface DecodedEightKItem {
  /** Normalized item code, e.g. '2.02'. */
  code: string;
  /** Authoritative SEC item label, or `Item {code}` when the code is unknown. */
  label: string;
  category: string;
  /** False when the code is not in the SEC taxonomy — label is a safe fallback, never invented. */
  known: boolean;
}

export interface EightKEvent {
  id: string;
  accessionNumber: string | null;
  form: string;
  title: string;
  /** ISO datetime the 8-K was filed. */
  filedAt: string;
  url: string | null;
  items: DecodedEightKItem[];
  /** True when the filer tagged no items (older 8-Ks / feed gaps) — shown honestly, never inferred. */
  untagged: boolean;
}

export interface EightKCategoryTally {
  category: string;
  /** Number of events that touched this category (an event counts once per distinct category). */
  count: number;
}

export interface EightKActivity {
  events: EightKEvent[];
  eventCount: number;
  /** Distinct item categories present, most-frequent first. */
  byCategory: EightKCategoryTally[];
  firstDate: string | null;
  lastDate: string | null;
  /** How many events carried no tagged items. */
  untaggedCount: number;
}

/** True for any Form 8-K variant (8-K, 8-K/A, 8-K12B, 8-K12G3, …). */
export function isEightK(form: string): boolean {
  return form.replace(/\s+/g, '').toUpperCase().startsWith('8-K');
}

/** Decode one raw 8-K item code into its authoritative label + display category. */
export function decodeEightKItem(raw: string): DecodedEightKItem {
  const code = raw.trim().replace(/^item\s*/i, '').replace(/[.:]\s*$/, '');
  const hit = EIGHT_K_ITEMS[code];
  if (hit) return { code, label: hit.label, category: hit.category, known: true };
  // Unknown/garbled code: never fabricate a label — echo the code itself.
  return { code, label: `Item ${code}`, category: CAT_UNKNOWN, known: false };
}

/**
 * Group a company's filings into an 8-K material-events timeline, decoding each
 * filer-tagged item. Non-8-K forms are ignored; 8-Ks with no tagged items are
 * kept and flagged `untagged` rather than dropped or guessed. Newest first.
 * Descriptive analytics only; not investment advice.
 */
export function eightKEvents(filings: Filing[], opts: { limit?: number } = {}): EightKActivity {
  const events: EightKEvent[] = [];
  for (const f of filings) {
    if (!isEightK(f.form)) continue;
    const items = (f.items ?? []).map(decodeEightKItem);
    events.push({
      id: f.id,
      accessionNumber: f.accessionNumber ?? null,
      form: f.form,
      title: f.title,
      filedAt: f.filedAt,
      url: f.url ?? null,
      items,
      untagged: items.length === 0,
    });
  }
  events.sort((a, b) => Date.parse(b.filedAt) - Date.parse(a.filedAt));
  const limited = opts.limit != null ? events.slice(0, Math.max(0, opts.limit)) : events;

  const catCounts = new Map<string, number>();
  let firstDate: string | null = null;
  let lastDate: string | null = null;
  let untaggedCount = 0;
  for (const e of limited) {
    if (e.untagged) untaggedCount += 1;
    const day = e.filedAt.slice(0, 10);
    if (day) {
      if (firstDate === null || day < firstDate) firstDate = day;
      if (lastDate === null || day > lastDate) lastDate = day;
    }
    const cats = new Set(e.items.map((it) => it.category));
    for (const c of cats) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }
  const byCategory = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return { events: limited, eventCount: limited.length, byCategory, firstDate, lastDate, untaggedCount };
}
