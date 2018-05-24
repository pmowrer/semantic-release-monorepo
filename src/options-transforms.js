const { compose, composeP, lensProp } = require('ramda');
const { overA } = require('./lens-utils');

const commits = lensProp('commits');
const nextRelease = lensProp('nextRelease');
const version = lensProp('version');

const mapCommits = (fn, includeComplimentaryCommits) =>
  overA(
    commits,
    async commits => await fn(commits, includeComplimentaryCommits)
  );

const mapNextReleaseVersion = overA(compose(nextRelease, version));

const withOptionsTransforms = transforms => plugin => async (
  pluginConfig,
  config
) => {
  return plugin(pluginConfig, await composeP(...transforms)(config));
};

module.exports = {
  mapCommits,
  mapNextReleaseVersion,
  withOptionsTransforms,
};
