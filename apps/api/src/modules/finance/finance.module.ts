import { Module } from '@nestjs/common';
import { CommissionService } from './commission.service';
import { LedgerService } from './ledger.service';

@Module({ providers: [LedgerService, CommissionService], exports: [LedgerService, CommissionService] })
export class FinanceModule {}
