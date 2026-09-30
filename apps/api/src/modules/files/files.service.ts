import { MalwareScanner } from './malware-scanner';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { File, PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { ApiError, notFound } from '../../common/errors';
import { StorageService } from '../../storage/storage.service';
import { AuditService } from '../../audit/audit.service';
import { ALLOWED_UPLOADS, sniffMatches, type UploadPurpose } from './file-types';
import type { Principal } from '../../auth/principal';

/** Object-level read authorization for stored files by owner type. */
@Injectable()
export class FilesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly scanner: MalwareScanner,
  ) {}

  /** Store an uploaded file privately, owned by the uploading user until attached to a domain object. */
  async upload(p: Principal, file: { buffer: Buffer; mimetype: string; size: number } | undefined, purpose: UploadPurpose, maxBytes: number) {
    if (!file) throw new ApiError('VALIDATION_FAILED', 'Choose a file to upload');
    if (file.size > maxBytes) throw new ApiError('PAYLOAD_TOO_LARGE', 'The file is too large');
    if (!ALLOWED_UPLOADS[file.mimetype]) throw new ApiError('VALIDATION_FAILED', 'This file type is not supported. Use PNG, JPEG, WebP, PDF or MP4.');
    if (!sniffMatches(file.mimetype, file.buffer)) throw new ApiError('VALIDATION_FAILED', 'The file content does not match its type');
    let verdict;
    try {
      verdict = await this.scanner.scan(file.buffer);
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Uploads are temporarily unavailable. Please try again shortly.');
    }
    if (!verdict.clean) {
      await this.audit.record({ actorUserId: p.userId, action: 'file.rejected_malware', objectType: 'file', reason: verdict.signature, after: { purpose, mimeType: file.mimetype, size: file.size } });
      throw new ApiError('VALIDATION_FAILED', 'This file was rejected by the security scan.');
    }
    const id = randomUUID();
    const key = `uploads/${p.userId}/${purpose}/${id}.${ALLOWED_UPLOADS[file.mimetype]!.ext}`;
    const stored = await this.storage.put(key, file.buffer, file.mimetype);
    const row = await this.prisma.file.create({
      data: { id, ownerType: 'user', ownerId: p.userId, storageKey: key, mimeType: file.mimetype, sizeBytes: BigInt(stored.size), checksum: stored.checksum, purpose, visibility: 'private', uploadedBy: p.userId },
      select: { id: true, mimeType: true, sizeBytes: true, purpose: true, createdAt: true },
    });
    await this.audit.record({ actorUserId: p.userId, action: 'file.uploaded', objectType: 'file', objectId: id, after: { purpose, mimeType: file.mimetype, size: stored.size } });
    return row;
  }

  /** Attach a user-owned upload to a domain object (partnership/dispute/...). Only the uploader can attach it. */
  async claim(tx: Pick<PrismaClient, 'file'>, p: Principal, fileId: string, owner: { ownerType: string; ownerId: string }, purpose: UploadPurpose): Promise<void> {
    const f = await tx.file.findUnique({ where: { id: fileId } });
    if (!f || f.uploadedBy !== p.userId || f.deletedAt || f.purpose !== purpose) throw new ApiError('VALIDATION_FAILED', 'File not found or not usable here', { field: 'fileId' });
    if (f.ownerType === owner.ownerType && f.ownerId === owner.ownerId) return;
    if (f.ownerType !== 'user') throw new ApiError('VALIDATION_FAILED', 'File is already attached elsewhere', { field: 'fileId' });
    await tx.file.update({ where: { id: fileId }, data: { ownerType: owner.ownerType, ownerId: owner.ownerId, visibility: 'restricted' } });
  }

  async assertCanRead(p: Principal, file: File): Promise<void> {
    if (file.visibility === 'public') return;
    if (p.platformPermissions.has('admin.moderation.manage') || p.platformPermissions.has('admin.disputes.manage')) return;
    switch (file.ownerType) {
      case 'partnership': {
        const ps = await this.prisma.partnership.findUnique({ where: { id: file.ownerId } });
        if (!ps) throw notFound('File');
        this.access.partnershipParty(p, ps);
        return;
      }
      case 'user':
        if (file.ownerId === p.userId) return;
        break;
      case 'business':
        if (p.businesses.has(file.ownerId)) return;
        break;
      case 'creator':
        if (p.creatorId === file.ownerId) return;
        break;
      case 'dispute': {
        const d = await this.prisma.dispute.findUnique({ where: { id: file.ownerId } });
        if (d && ((d.creatorId && d.creatorId === p.creatorId) || (d.businessId && p.businesses.has(d.businessId)))) return;
        break;
      }
    }
    throw notFound('File');
  }
}
