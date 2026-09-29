import { Module } from '@nestjs/common';
import { ConversionsModule } from '../conversions/conversions.module';
import { FinanceModule } from '../finance/finance.module';
import { AdapterRegistry } from './adapters/registry';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [ConversionsModule, FinanceModule],
  controllers: [IntegrationsController],
  providers: [AdapterRegistry, IntegrationsService, WebhooksService, ReconciliationService],
  exports: [IntegrationsService, WebhooksService, ReconciliationService, AdapterRegistry],
})
export class IntegrationsModule {}
