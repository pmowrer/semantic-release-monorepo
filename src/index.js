const readPkg = require('read-pkg');
const { compose } = require('ramda');
const pluginDefinitions = require('semantic-release/lib/definitions/plugins');
const withOnlyPackageCommits = require('./only-package-commits');
const versionToGitTag = require('./version-to-git-tag');
const logPluginVersion = require('./log-plugin-version');
const {
  wrapPlugin,
  wrapMultiPlugin,
} = require('semantic-release-plugin-decorators');

const {
  mapNextReleaseVersion,
  withOptionsTransforms,
} = require('./options-transforms');

const NAMESPACE = 'monorepo';

const analyzeCommits = wrapMultiPlugin(
  NAMESPACE,
  'analyzeCommits',
  compose(logPluginVersion('analyzeCommits'), withOnlyPackageCommits),
  pluginDefinitions.analyzeCommits.default
);

const generateNotes = wrapPlugin(
  NAMESPACE,
  'generateNotes',
  compose(
    logPluginVersion('generateNotes'),
    withOnlyPackageCommits,
    withOptionsTransforms([mapNextReleaseVersion(versionToGitTag)])
  ),
  pluginDefinitions.generateNotes.default
);

module.exports = {
  analyzeCommits,
  generateNotes,
  tagFormat: readPkg.sync().name + '-v${version}',
};
