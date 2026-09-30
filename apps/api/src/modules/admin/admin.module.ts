import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FraudModule } from '../fraud/fraud.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { AdminActionsService } from './admin-actions.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrivacyService } from './privacy.service';

@Module({ imports: [FinanceModule, FraudModule, NotificationsModule, PayoutsModule], controllers: [AdminController], providers: [AdminActionsService, AdminService, PrivacyService], exports: [AdminActionsService] })
export class AdminModule {}
