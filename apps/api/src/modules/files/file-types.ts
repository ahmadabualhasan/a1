/**
 * Upload allowlist with magic-byte verification (spec §22 secure file uploads): the declared MIME type must match the
 * file's actual signature. SVG/HTML/scripts are never accepted (XSS vectors).
 */
export const ALLOWED_UPLOADS: Record<string, { ext: string; check: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', check: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'application/pdf': { ext: 'pdf', check: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  'video/mp4': { ext: 'mp4', check: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
};

export const UPLOAD_PURPOSES = ['message_attachment', 'content_submission', 'dispute_evidence', 'verification_document', 'avatar', 'campaign_image', 'catalog_media'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export function sniffMatches(mime: string, buf: Buffer): boolean {
  const def = ALLOWED_UPLOADS[mime];
  return !!def && buf.length >= 12 && def.check(buf);
}
