// Metro config for the pnpm monorepo (node-linker=hoisted).
// - watches the workspace root so changes in packages/* hot-reload
// - resolves @halal-meet/core straight from its TypeScript sources (no build step needed)
const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const coreSrc = path.resolve(workspaceRoot, 'packages/core/src/index.ts');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@halal-meet/core' && fs.existsSync(coreSrc)) {
    return { type: 'sourceFile', filePath: coreSrc };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
