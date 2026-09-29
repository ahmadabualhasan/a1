import { formatMoney } from '@codek/api-client';

export function Money({ minor, currency }: { minor: number | string | null | undefined; currency: string | null | undefined }) {
  return <span className="tabular-nums">{formatMoney(minor, currency)}</span>;
}

export function DateText({ value, withTime = false }: { value: string | null | undefined; withTime?: boolean }) {
  if (!value) return <span>—</span>;
  const d = new Date(value);
  return <time dateTime={value}>{withTime ? d.toLocaleString() : d.toLocaleDateString()}</time>;
}
