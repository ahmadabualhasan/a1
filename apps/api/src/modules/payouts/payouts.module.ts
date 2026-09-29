import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({ imports: [FinanceModule], controllers: [PayoutsController], providers: [PayoutsService], exports: [PayoutsService] })
export class PayoutsModule {}
