import type { DynamicModule, Type } from '@nestjs/common';
import { BusinessesModule } from './businesses/businesses.module';
import { CreatorsModule } from './creators/creators.module';

/** Domain modules of the modular monolith (spec §18). Registered here in dependency order. */
export const DOMAIN_MODULES: Array<Type | DynamicModule> = [BusinessesModule, CreatorsModule];
