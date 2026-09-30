/**
 * Keep server bundles lean: better-auth and @prisma/client declare many OPTIONAL peers (web frameworks, other ORMs,
 * the Prisma CLI). pnpm would otherwise link them to the workspace's copies (e.g. Next.js from apps/web), shipping
 * hundreds of MB of unused code in the API/worker images. Only optional peers are removed, and @prisma/client is kept
 * because the Prisma adapter uses it.
 */
const KEEP = new Set(['@prisma/client']);
const TRIM = (name) => name === 'better-auth' || name.startsWith('@better-auth/') || name === '@prisma/client';

function readPackage(pkg) {
  if (!TRIM(pkg.name) || !pkg.peerDependencies) return pkg;
  const meta = pkg.peerDependenciesMeta || {};
  for (const peer of Object.keys(pkg.peerDependencies)) {
    if (meta[peer] && meta[peer].optional && !KEEP.has(peer)) {
      delete pkg.peerDependencies[peer];
      delete meta[peer];
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
