/**
 * Percent ⇄ decimal-fraction conversion done on strings (no floating point): "12.5" % ⇄ "0.125".
 * The API stores rates as fractions with up to 6 decimal places.
 */
export function percentToRate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,3})(?:\.(\d{1,4}))?$/);
  if (!m) return null;
  const digits = `${m[1]}${m[2] ?? ''}`.padStart(3, '0');
  const fracLen = (m[2] ?? '').length + 2;
  const intPart = digits.slice(0, digits.length - fracLen) || '0';
  const frac = digits.slice(digits.length - fracLen).padStart(fracLen, '0').replace(/0+$/, '');
  const out = `${String(Number(intPart))}${frac ? `.${frac}` : ''}`;
  return /^(0(\.\d+)?|1(\.0+)?)$/.test(out) ? out : null;
}

export function rateToPercent(rate: string | null | undefined): string {
  if (!rate) return '';
  const [i = '0', f = ''] = rate.split('.');
  const padded = f.padEnd(2, '0');
  const whole = `${i}${padded.slice(0, 2)}`.replace(/^0+(?=\d)/, '');
  const rest = padded.slice(2).replace(/0+$/, '');
  return rest ? `${whole}.${rest}` : whole;
}

/** Minor units → editable major string ("12500", JOD → "12.500"), display-only. */
export function minorToInput(minor: number | string | null | undefined, exp: number): string {
  if (minor == null) return '';
  const s = String(minor).padStart(exp + 1, '0');
  return exp ? `${s.slice(0, s.length - exp)}.${s.slice(s.length - exp)}` : s;
}

export const CURRENCY_EXPONENT: Record<string, number> = { JOD: 3, KWD: 3, BHD: 3, OMR: 3, TND: 3, IQD: 3, LYD: 3, JPY: 0, KRW: 0 };
export const exponentOf = (currency: string) => CURRENCY_EXPONENT[currency] ?? 2;

/** datetime-local value → ISO string with offset; '' → undefined. */
export function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function isoToLocal(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
