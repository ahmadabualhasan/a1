import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from '@codek/config';

export const ENV = Symbol('CODEK_ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
