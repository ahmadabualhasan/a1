import { MalwareScanner } from './malware-scanner';
import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({ controllers: [FilesController], providers: [FilesService, MalwareScanner], exports: [FilesService] })
export class FilesModule {}
