import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { CatalogService } from './catalog.service';
import { CatalogQueryDto, CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog.dto';

@ApiTags('catalog')
@Controller('businesses/:businessId/catalog')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get()
  list(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: CatalogQueryDto) {
    return this.svc.list(p, businessId, q);
  }

  @Post()
  create(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: CreateCatalogItemDto) {
    return this.svc.create(p, businessId, dto);
  }

  @Get(':id')
  get(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(p, businessId, id);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() p: Principal,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.svc.update(p, businessId, id, dto);
  }
}
