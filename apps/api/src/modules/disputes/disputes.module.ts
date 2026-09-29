import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { FinanceModule } from '../finance/finance.module';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({ imports: [FinanceModule, FilesModule], controllers: [DisputesController], providers: [DisputesService] })
export class DisputesModule {}
