import { Module } from '@nestjs/common';
import { CORE_MODULES, DOMAIN_MODULES } from '@codek/api';
import { WorkerRunner } from './worker.runner';

/** The worker reuses the API's modules (modular monolith) without starting the HTTP server. */
@Module({ imports: [...CORE_MODULES, ...DOMAIN_MODULES], providers: [WorkerRunner] })
export class WorkerModule {}
