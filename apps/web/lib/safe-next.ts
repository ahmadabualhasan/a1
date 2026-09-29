/** Only same-site relative paths are accepted as post-login redirects (open-redirect defence, spec §22). */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\r\n]/.test(raw)) return null;
  return raw;
}
