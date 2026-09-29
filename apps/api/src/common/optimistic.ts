import { ApiError } from './errors';

/** Optimistic locking: updateMany with a version predicate; zero rows means someone else changed it first. */
export function assertVersionUpdated(count: number): void {
  if (count === 0) throw new ApiError('VERSION_CONFLICT', 'This record was changed by someone else. Reload and try again.');
}
