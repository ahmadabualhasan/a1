import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FraudService } from './fraud.service';

@Module({ imports: [FinanceModule], providers: [FraudService], exports: [FraudService] })
export class FraudModule {}
