import { Inject, Injectable } from '@nestjs/common';
import type { SafeHttpClient } from '../../../common/safe-http';
import { SAFE_HTTP } from '../../../payments/payments.module';
import type { IntegrationAdapter } from './adapter.types';
import { CustomWebhookAdapter } from './custom.adapter';
import { ShopifyAdapter } from './shopify.adapter';

/** Adapter registry — adding a provider never changes the core domain (spec §11.1). */
@Injectable()
export class AdapterRegistry {
  private readonly adapters: Map<string, IntegrationAdapter>;

  constructor(@Inject(SAFE_HTTP) http: SafeHttpClient) {
    const list: IntegrationAdapter[] = [new CustomWebhookAdapter(), new ShopifyAdapter(http)];
    this.adapters = new Map(list.map((a) => [a.provider, a]));
  }

  get(provider: string): IntegrationAdapter | undefined {
    return this.adapters.get(provider);
  }

  list(): IntegrationAdapter[] {
    return [...this.adapters.values()];
  }
}
