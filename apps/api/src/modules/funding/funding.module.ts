import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FundingController } from './funding.controller';
import { FundingService } from './funding.service';

@Module({ imports: [FinanceModule], controllers: [FundingController], providers: [FundingService], exports: [FundingService] })
export class FundingModule {}
