import { Controller, Get, Inject, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { PrismaClient } from '@codek/database';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { AccessService } from '../../access/access.service';
import { RawResponse } from '../../common/envelope.interceptor';
import { notFound } from '../../common/errors';
import { PRISMA } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FilesService } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    private readonly files: FilesService,
  ) {}

  /** Streams a private object after object-level authorization (no public bucket URLs). */
  @RawResponse()
  @Get(':id/download')
  async download(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.deletedAt) throw notFound('File');
    await this.files.assertCanRead(p, file);
    const body = await this.storage.get(file.storageKey);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Content-Disposition', `attachment; filename="${file.id}${extFor(file.mimeType)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(body);
  }
}

function extFor(mime: string): string {
  return ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'application/pdf': '.pdf', 'video/mp4': '.mp4', 'text/csv': '.csv' } as Record<string, string>)[mime] ?? '';
}
