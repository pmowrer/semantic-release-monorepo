const { compose, composeP, unless } = require('ramda');
const pluginDefinitions = require('semantic-release/lib/plugins/definitions');
const { writeLastRunHead } = require('./last-run-file');
const withOnlyPackageCommits = require('./only-package-commits');
const versionToGitTag = require('./version-to-git-tag');
const withVersionHead = require('./with-version-head');
const logPluginVersion = require('./log-plugin-version');
const {
  wrapPlugin,
  wrapMultiPlugin,
} = require('semantic-release-plugin-decorators');

const {
  mapNextReleaseVersion,
  mapLastReleaseVersionToLastReleaseGitTag,
  mapNextReleaseVersionToNextReleaseGitTag,
  withOptionsTransforms,
} = require('./options-transforms');

const NAMESPACE = 'monorepo';

const analyzeCommits = wrapPlugin(
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
    withOptionsTransforms([
      mapLastReleaseVersionToLastReleaseGitTag(versionToGitTag),
      mapNextReleaseVersionToNextReleaseGitTag(versionToGitTag),
      mapNextReleaseVersion(versionToGitTag),
    ])
  ),
  pluginDefinitions.generateNotes.default
);

const getLastRelease = wrapPlugin(
  NAMESPACE,
  'getLastRelease',
  compose(logPluginVersion('getLastRelease'), withVersionHead),
  pluginDefinitions.getLastRelease.default
);

const publish = wrapMultiPlugin(
  NAMESPACE,
  'publish',
  compose(
    logPluginVersion('publish'),
    withOptionsTransforms([
      mapNextReleaseVersionToNextReleaseGitTag(versionToGitTag),
    ])
  ),
  pluginDefinitions.publish.default
);

// Async version of Ramda's `tap`
const tapA = fn => async x => {
  await fn(x);
  return x;
};

module.exports = {
  analyzeCommits: composeP(
    // If `analyzeCommits` didn't return a new version, `semantic-release` exits.
    // Write to the "last-run" file to avoid parsing these same commits again.
    tapA(unless(Boolean, writeLastRunHead)),
    analyzeCommits
  ),
  generateNotes,
  getLastRelease,
  publish,
};
