import { Module } from '@nestjs/common';
import { CampaignsModule } from '../modules/campaigns/campaigns.module';
import { PromotionModule } from '../modules/promotion/promotion.module';
import { FinanceModule } from '../modules/finance/finance.module';
import { IntegrationsModule } from '../modules/integrations/integrations.module';
import { PayoutsModule } from '../modules/payouts/payouts.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { BillingModule } from '../billing/billing.module';
import { JobsService } from './jobs.service';

@Module({ imports: [CampaignsModule, PromotionModule, FinanceModule, IntegrationsModule, PayoutsModule, AnalyticsModule, BillingModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
