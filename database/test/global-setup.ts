import { migrateTestDatabase, useTestDatabase } from '../src/test-support';

export default function setup(): void {
  migrateTestDatabase(useTestDatabase());
}
