import { identity, memoizeWith, pipeP } from 'ramda';
import pkgUp from 'pkg-up';
import readPkg from 'read-pkg';
import path from 'path';
import pLimit from 'p-limit';
import createDebug from 'debug';
import { getCommitFiles, getRoot } from './git-utils.js';
import { mapCommits } from './options-transforms.js';

const debug = createDebug('semantic-release:monorepo');
const memoizedGetCommitFiles = memoizeWith(identity, getCommitFiles);

/**
 * Get the normalized PACKAGE root path, relative to the git PROJECT root.
 */
const getPackagePath = async () => {
  const packagePath = await pkgUp();
  const gitRoot = await getRoot();

  return path.relative(gitRoot, path.resolve(packagePath, '..'));
};

const withFiles = async commits => {
  // Handle case where commits is null, undefined, or not an array
  if (!commits || !Array.isArray(commits) || commits.length === 0) {
    return {
      // Return an empty array of commits with no files
      commits: [],
      files: []
    }
  }
  
  const limit = pLimit(Number(process.env.SRM_MAX_THREADS) || 500);
  return Promise.all(
    commits.map(commit =>
      limit(async () => {
        const files = await memoizedGetCommitFiles(commit.hash);
        return { ...commit, files };
      })
    )
  );
};

const onlyPackageCommits = async commits => {
  // Handle case where commits is null, undefined, or not an array
  if (!commits || !Array.isArray(commits) || commits.length === 0) {
    return {
      // Return an empty array of commits with no files
      commits: [],
      files: []
    };
  }
  
  const packagePath = await getPackagePath();
  debug('Filter commits by package path: "%s"', packagePath);
  const commitsWithFiles = await withFiles(commits);
  // Convert package root path into segments - one for each folder
  const packageSegments = packagePath.split(path.sep);

  return commitsWithFiles.filter(({ files, subject }) => {
    // Normalise paths and check if any changed files' path segments start
    // with that of the package root.
    const packageFile = files.find(file => {
      const fileSegments = path.normalize(file).split(path.sep);
      // Check the file is a *direct* descendent of the package folder (or the folder itself)
      return packageSegments.every(
        (packageSegment, i) => packageSegment === fileSegments[i]
      );
    });

    if (packageFile) {
      debug(
        'Including commit "%s" because it modified package file "%s".',
        subject,
        packageFile
      );
    }

    return !!packageFile;
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

  return plugin(
    pluginConfig,
    await pipeP(
      mapCommits(onlyPackageCommits),
      tapA(logFilteredCommitCount(logger))
    )(config)
  );
};

export { withOnlyPackageCommits, onlyPackageCommits, withFiles };
