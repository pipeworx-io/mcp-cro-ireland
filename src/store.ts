/**
 * Reads for cro-ireland (fleet #3346).
 *
 * Data comes from the CRO (Companies Registration Office), Ireland's
 * statutory register for companies and business names. The CRO publishes a
 * daily snapshot of every company's identity, type, status and registered
 * address as open data on its own open-data portal -- no live per-record
 * API for this slice -- so scripts/cro-ireland/refresh.sh downloads it and
 * loads it into a D1 database the gateway hands this pack as `_d1`
 * (pack-manifest "d1Binding": "IE_CRO_DB"). Table/column names here must
 * match scripts/cro-ireland/schema.sql.
 *
 * Reuse terms: Creative Commons Attribution 4.0 (CC BY 4.0), published under
 * Ireland's Open Data Directive as a "high-value dataset". Every response
 * here carries `source`, `licence` and `data_as_of`.
 *
 * Filings/submissions are NOT in this open-data snapshot -- see index.ts for
 * the BYOK live route against the CRO's own Open Services API.
 */

export interface D1Like {
  prepare(sql: string): D1StmtLike;
}
export interface D1StmtLike {
  bind(...values: unknown[]): D1StmtLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export const SOURCE = 'CRO (Companies Registration Office), Company Records open data';
export const LICENCE = 'Creative Commons Attribution 4.0 (CC BY 4.0) -- published by the CRO on its own open-data portal.';

export class StoreUnavailableError extends Error {
  constructor() {
    super(
      'cro-ireland: the register is not bound in this runtime (no _d1). These tools only answer through the Pipeworx gateway; a standalone install has no data to read.',
    );
    this.name = 'StoreUnavailableError';
  }
}
export function requireDb(d1: unknown): D1Like {
  if (!d1 || typeof (d1 as D1Like).prepare !== 'function') throw new StoreUnavailableError();
  return d1 as D1Like;
}

export async function dataAsOf(db: D1Like): Promise<string | null> {
  const r = await db.prepare(`SELECT value FROM ie_meta WHERE key = 'data_as_of'`).first<{ value: string }>();
  return r?.value ?? null;
}

/** Uppercase, collapse punctuation/whitespace to single spaces. MUST match
 *  normalize_name() in scripts/cro-ireland/build-sqlite.py. */
export function normalizeName(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export interface CompanyRow {
  cro_number: string;
  name: string;
  name_norm: string;
  status_code: string | null;
  status: string | null;
  type_code: string | null;
  type: string | null;
  incorporation_date: string | null;
  address: string | null;
  eircode: string | null;
  dissolved_date: string | null;
  last_annual_return_date: string | null;
  next_annual_return_date: string | null;
  last_accounts_date: string | null;
  status_date: string | null;
  nace_code: string | null;
  principal_activity_code: string | null;
}
const COMPANY_COLS = `cro_number, name, name_norm, status_code, status, type_code, type, incorporation_date,
  address, eircode, dissolved_date, last_annual_return_date, next_annual_return_date, last_accounts_date,
  status_date, nace_code, principal_activity_code`;

export async function findByNumber(db: D1Like, croNumber: string): Promise<CompanyRow | null> {
  return db.prepare(`SELECT ${COMPANY_COLS} FROM ie_companies WHERE cro_number = ?`).bind(croNumber).first<CompanyRow>();
}

/** Prefix range scan on the indexed name_norm column -- same shape as
 *  estonia-business-register searchByName. A plain B-tree range query
 *  needs no post-import rebuild step, sidestepping the FTS5-chunked-import
 *  trap (reference_d1_fts5_import_trap.md) entirely. */
export async function searchByName(
  db: D1Like,
  prefixNorm: string,
  statusCode: string | null,
  limit: number,
): Promise<CompanyRow[]> {
  const params: unknown[] = [prefixNorm, `${prefixNorm}￿`];
  let sql = `SELECT ${COMPANY_COLS} FROM ie_companies WHERE name_norm >= ? AND name_norm < ?`;
  if (statusCode) {
    sql += ` AND status_code = ?`;
    params.push(statusCode);
  }
  sql += ` ORDER BY name_norm LIMIT ?`;
  params.push(limit);
  const r = await db
    .prepare(sql)
    .bind(...params)
    .all<CompanyRow>();
  return r.results;
}
