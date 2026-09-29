import type { DynamicModule, Type } from '@nestjs/common';
import { BusinessesModule } from './businesses/businesses.module';
import { CreatorsModule } from './creators/creators.module';
import { CatalogModule } from './catalog/catalog.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { PromotionModule } from './promotion/promotion.module';
import { PartnershipsModule } from './partnerships/partnerships.module';
import { FilesModule } from './files/files.module';
import { FinanceModule } from './finance/finance.module';
import { TrackingModule } from './tracking/tracking.module';
import { ConversionsModule } from './conversions/conversions.module';

/** Domain modules of the modular monolith (spec §18). Registered here in dependency order. */
export const DOMAIN_MODULES: Array<Type | DynamicModule> = [BusinessesModule, CreatorsModule, CatalogModule, CampaignsModule, PromotionModule, PartnershipsModule, FilesModule, FinanceModule, TrackingModule, ConversionsModule];
