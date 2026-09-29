import { Global, Module } from '@nestjs/common';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { SafeHttpClient } from '../common/safe-http';
import { PayPalPayoutProvider } from './paypal.provider';
import { SandboxFundingProvider, SandboxPayoutProvider } from './sandbox.provider';
import type { FundingProvider, PayoutProvider } from './provider.types';

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');
export const FUNDING_PROVIDERS = Symbol('FUNDING_PROVIDERS');
export const SAFE_HTTP = Symbol('SAFE_HTTP');

@Global()
@Module({
  providers: [
    { provide: SAFE_HTTP, inject: [ENV], useFactory: (env: Env) => new SafeHttpClient(env.OUTBOUND_HOST_ALLOWLIST) },
    {
      provide: PAYOUT_PROVIDER,
      inject: [ENV, SAFE_HTTP],
      useFactory: (env: Env, http: SafeHttpClient): PayoutProvider =>
        env.PAYOUT_PROVIDER === 'paypal'
          ? new PayPalPayoutProvider(http, { environment: env.PAYPAL_ENVIRONMENT, clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET })
          : new SandboxPayoutProvider(),
    },
    {
      provide: FUNDING_PROVIDERS,
      inject: [ENV],
      // Bank transfer funding is handled internally (pending → admin confirmation); sandbox only outside production.
      useFactory: (env: Env): FundingProvider[] => (env.APP_ENV === 'production' ? [] : [new SandboxFundingProvider()]),
    },
  ],
  exports: [PAYOUT_PROVIDER, FUNDING_PROVIDERS, SAFE_HTTP],
})
export class PaymentsModule {}
