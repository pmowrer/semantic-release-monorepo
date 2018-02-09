const { pipe, pipeP, split, prop, not } = require('ramda');
const execa = require('execa');
const debug = require('debug')('semantic-release:monorepo');

const stdout = prop('stdout');
const bool = pipe(prop('code'), Boolean, not);

const git = async (args, options = {}) => await execa('git', args, options);

const getHead = pipeP(() => git(['rev-parse', 'HEAD']), stdout);

/**
 * // https://stackoverflow.com/questions/424071/how-to-list-all-the-files-in-a-commit
 * @async
 * @param hash Git commit hash.
 * @return {Promise<Array>} List of modified files in a commit.
 */
const getCommitFiles = pipeP(
  hash => git(['diff-tree', '--no-commit-id', '--name-only', '-r', hash]),
  stdout,
  split('\n')
);

/**
 * https://stackoverflow.com/a/957978/89594
 * @async
 * @return {Promise<String>} System path of the git repository.
 */
const getRoot = pipeP(() => git(['rev-parse', '--show-toplevel']), stdout);

/**
 * Get the commit sha for a given tag.
 * https://github.com/semantic-release/semantic-release/blob/996305d69c36158f771bd20b6b416aa3461fb309/lib/git.js#L12
 *
 * @param {string} tagName Tag name for which to retrieve the commit sha.
 * @return {string} The commit sha of the tag in parameter or `null`.
 */
const getTagHead = pipeP(
  tagName => git(['rev-list', '-1', tagName], { reject: false }),
  stdout
);

/**
 * Fetch tags from the repository's origin.
 */
const fetchTags = pipeP(() => git(['fetch', '--tags']), stdout);

/**
 * Unshallow the git repository (retrieving every commit and tags).
 * Adapted from: https://github.com/semantic-release/npm/blob/cf039fdafda1a5ce43c2a5f033160cd46487f102/lib/git.js
 */
const unshallow = pipeP(
  () => git(['fetch', '--unshallow', '--tags'], { reject: false }),
  stdout
);

// https://stackoverflow.com/a/13526591/89594
const isAncestor = pipeP(
  (ancestor, descendant) =>
    git(['merge-base', '--is-ancestor', ancestor, descendant], {
      reject: false,
    }),
  bool
);

module.exports = {
  getCommitFiles,
  getHead,
  getRoot,
  getTagHead,
  fetchTags,
  isAncestor,
  unshallow,
};
