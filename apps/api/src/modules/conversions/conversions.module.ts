import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { AttributionService } from './attribution.service';
import { ConversionsController } from './conversions.controller';
import { ConversionsQueryService } from './conversions.query';
import { ConversionsService } from './conversions.service';

@Module({
  imports: [FinanceModule],
  controllers: [ConversionsController],
  providers: [AttributionService, ConversionsService, ConversionsQueryService],
  exports: [ConversionsService, ConversionsQueryService],
})
export class ConversionsModule {}
