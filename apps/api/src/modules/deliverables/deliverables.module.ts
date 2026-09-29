import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { DeliverablesController } from './deliverables.controller';
import { DeliverablesService } from './deliverables.service';

@Module({ imports: [FilesModule], controllers: [DeliverablesController], providers: [DeliverablesService] })
export class DeliverablesModule {}
