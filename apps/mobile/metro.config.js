const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so changes inside packages/core hot-reload.
config.watchFolders = [workspaceRoot];

// Tell Metro about both node_modules folders (the app's own + the hoisted root).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Prevent Metro from hiking up the filesystem looking for additional copies.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
