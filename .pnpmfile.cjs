// drizzle-orm declares @opentelemetry/api as an optional peer. Once any workspace package (e.g. @sentry/nextjs in apps/web)
// brings that package in, pnpm resolves a second drizzle-orm instance for it and the SQL types stop matching across packages.
// We never use drizzle's OpenTelemetry hooks, so drop the peer: one drizzle-orm instance repo-wide.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'drizzle-orm') {
        for (const field of ['peerDependencies', 'peerDependenciesMeta']) delete pkg[field]?.['@opentelemetry/api'];
      }
      return pkg;
    },
  },
};
