const { identity, memoizeWith, pipeP } = require('ramda');
const pkgUp = require('pkg-up');
const readPkg = require('read-pkg');
const path = require('path');
const debug = require('debug')('semantic-release:monorepo');
const { getCommitFiles, getRoot } = require('./git-utils');
const { mapCommits } = require('./options-transforms');

const memoizedGetCommitFiles = memoizeWith(identity, getCommitFiles);

/**
 * Get the normalized PACKAGE root path, relative to the git PROJECT root.
 */
const getPackagePath = async () => {
  const absolutePackagePath = await pkgUp();
  const gitRoot = await getRoot();

  const packagePath = path.relative(
    gitRoot,
    path.resolve(absolutePackagePath, '..')
  );

  // Assumes all packages are stored in the same directory.
  const packagesPath = path.relative(
    gitRoot,
    path.resolve(absolutePackagePath, '../../')
  );

  return { packagePath, packagesPath };
};

const withFiles = async commits => {
  return Promise.all(
    commits.map(async commit => {
      const files = await memoizedGetCommitFiles(commit.hash);
      return { ...commit, files };
    })
  );
};

const onlyPackageCommits = async (commits, includeComplementaryCommits) => {
  const { packagePath, packagesPath } = await getPackagePath();
  debug('Filter commits by package path: "%s"', packagePath);
  const commitsWithFiles = await withFiles(commits);
  // Convert package root path into segments - one for each folder
  const packageSegments = packagePath.split(path.sep);

  return commitsWithFiles.filter(({ files, subject }) => {
    // Normalise paths and check if any changed files' path segments start
    // with that of the package root.
    let isPackageFile;
    let isComplementaryFile;
    const file = files.find(file => {
      const fileSegments = path.normalize(file).split(path.sep);
      // Check the file is a *direct* descendent of the package folder (or the folder itself)
      isPackageFile = packageSegments.every(
        (packageSegment, i) => packageSegment === fileSegments[i]
      );
      // Check if the file is a complementary file.
      // This is defined as a file that is outside the "packages" directory.
      isComplementaryFile =
        fileSegments[0] === packagesPath ? isPackageFile : true;
      return isPackageFile || isComplementaryFile;
    });

    if (isPackageFile) {
      debug(
        'Including commit "%s" because it modified package file "%s".',
        subject,
        file
      );
      return true;
    }

    if (includeComplementaryCommits && isComplementaryFile) {
      debug(
        'Including commit "%s" because it modified complementary package file "%s".',
        subject,
        file
      );
      return true;
    }

    return false;
  });
};

// Async version of Ramda's `tap`
const tapA = fn => async x => {
  await fn(x);
  return x;
};

const logFilteredCommitCount = logger => async ({ commits }) => {
  const { name } = await readPkg();

  logger.log(
    'Found %s commits for package %s since last release',
    commits.length,
    name
  );
};

const withOnlyPackageCommits = plugin => async (pluginConfig, config) => {
  const { logger } = config;
  const { includeComplementaryCommits } = pluginConfig.monorepo || {};
  return plugin(
    pluginConfig,
    await pipeP(
      mapCommits(onlyPackageCommits, includeComplementaryCommits),
      tapA(logFilteredCommitCount(logger))
    )(config)
  );
};

module.exports = withOnlyPackageCommits;
