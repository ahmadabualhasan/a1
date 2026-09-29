import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PromotionModule } from '../promotion/promotion.module';
import { ApplicationsService } from './applications.service';
import { PartnershipFactory } from './partnership-factory.service';
import { PartnershipsController } from './partnerships.controller';
import { PartnershipsService } from './partnerships.service';

@Module({
  imports: [CampaignsModule, PromotionModule],
  controllers: [PartnershipsController],
  providers: [ApplicationsService, PartnershipFactory, PartnershipsService],
  exports: [PartnershipsService, ApplicationsService],
})
export class PartnershipsModule {}
