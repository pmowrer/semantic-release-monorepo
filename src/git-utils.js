const { pipeP, split } = require('ramda');
const execa = require('execa');

const git = async (args, options = {}) => {
  const { stdout } = await execa('git', args, options);
  return stdout;
};

/**
 * // https://stackoverflow.com/questions/424071/how-to-list-all-the-files-in-a-commit
 * @async
 * @param hash Git commit hash.
 * @return {Promise<Array>} List of modified files in a commit.
 */
const getCommitFiles = pipeP(
  hash => git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m' hash]),
  split('\n')
);

/**
 * https://stackoverflow.com/a/957978/89594
 * @async
 * @return {Promise<String>} System path of the git repository.
 */
const getRoot = () => git(['rev-parse', '--show-toplevel']);

module.exports = {
  getCommitFiles,
  getRoot,
};


// merge commit 
git diff-tree --no-commit-id --name-only -r 059cc69a7aaf40d85432afc7fab2620f267700c6

// actual commit
git diff-tree --no-commit-id --name-only -r 4635eec8800660d3a421ba55156d360a0380674b