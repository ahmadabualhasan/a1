import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { RateLimit } from '../../common/rate-limit';
import { UPLOAD_PURPOSES } from './file-types';
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
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Multipart upload (field "file", body field "purpose"). Files are private; access is authorized per object. */
  @RateLimit({ bucket: 'files.upload', limit: 30, windowSeconds: 600 })
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5 } }))
  upload(@CurrentPrincipal() p: Principal, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, unknown>) {
    const purpose = z.enum(UPLOAD_PURPOSES).parse(body?.purpose);
    return this.files.upload(p, file, purpose, this.env.MAX_UPLOAD_BYTES);
  }

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
