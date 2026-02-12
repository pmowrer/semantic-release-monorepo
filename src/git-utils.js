import execa from 'execa';
import { pipeP, split } from 'ramda';
import fse from 'fs-extra';
import path from 'path';
import { temporaryDirectory } from 'tempy';
import fileUrl from 'file-url';
import gitLogParser from 'git-log-parser';
import pEachSeries from 'p-each-series';
import getStream from 'get-stream';

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
  hash =>
    git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', hash]),
  split('\n')
);

/**
 * https://stackoverflow.com/a/957978/89594
 * @async
 * @return {Promise<String>} System path of the git repository.
 */
const getRoot = () => git(['rev-parse', '--show-toplevel']);

/**
 * Create commits on the current git repository.
 *
 * @param {Array<string>} messages Commit messages.
 * @param {Object} [execaOpts] Options to pass to `execa`.
 *
 * @returns {Array<Commit>} The created commits, in reverse order (to match `git log` order).
 */
const gitCommitsWithFiles = async commits => {
  for (const commit of commits) {
    for (const file of commit.files) {
      const filePath = path.join(process.cwd(), file.name);
      if (file.body === undefined) {
        file.body = commit.message;
      }
      await fse.outputFile(filePath, file.body);
      await execa('git', ['add', filePath]);
    }
    await execa('git', [
      'commit',
      '-m',
      commit.message,
      '--allow-empty',
      '--no-gpg-sign',
    ]);
  }
  return (await gitGetCommits(undefined)).slice(0, commits.length);
};

/**
 * Initialize git repository
 * If `withRemote` is `true`, creates a bare repository and initialize it.
 * If `withRemote` is `false`, creates a regular repository and initialize it.
 *
 * @param {Boolean} withRemote `true` to create a shallow clone of a bare repository.
 * @return {{cwd: string, repositoryUrl: string}} The path of the repository
 */
const initGit = async withRemote => {
  const cwd = temporaryDirectory();
  const args = withRemote
    ? ['--bare', '--initial-branch=master']
    : ['--initial-branch=master'];

  await execa('git', ['init', ...args], { cwd }).catch(async () => {
    const args = withRemote ? ['--bare'] : [];
    return await execa('git', ['init', ...args], { cwd });
  });
  const repositoryUrl = fileUrl(cwd);
  return { cwd, repositoryUrl };
};

/**
 * Create commits on the current git repository.
 *
 * @param {Array<string>} messages Commit messages.
 * @param {Object} [execaOpts] Options to pass to `execa`.
 *
 * @returns {Array<Commit>} The created commits, in reverse order (to match `git log` order).
 */
const gitCommits = async (messages, execaOptions) => {
  await pEachSeries(
    messages,
    async message =>
      (
        await execa(
          'git',
          ['commit', '-m', message, '--allow-empty', '--no-gpg-sign'],
          execaOptions
        )
      ).stdout
  );
  return (await gitGetCommits(undefined, execaOptions)).slice(
    0,
    messages.length
  );
};

/**
 * Get the list of parsed commits since a git reference.
 *
 * @param {String} [from] Git reference from which to seach commits.
 * @param {Object} [execaOpts] Options to pass to `execa`.
 *
 * @return {Array<Commit>} The list of parsed commits.
 */
const gitGetCommits = async from => {
  Object.assign(gitLogParser.fields, {
    hash: 'H',
    message: 'B',
    gitTags: 'd',
    committerDate: { key: 'ci', type: Date },
  });
  return (
    await getStream.array(
      gitLogParser.parse(
        { _: `${from ? `${from}..` : ''}HEAD` },
        { env: { ...process.env } }
      )
    )
  ).map(commit => {
    commit.message = commit.message.trim();
    commit.gitTags = commit.gitTags.trim();
    return commit;
  });
};

/**
 * Initialize an existing bare repository:
 * - Clone the repository
 * - Change the current working directory to the clone root
 * - Create a default branch
 * - Create an initial commits
 * - Push to origin
 *
 * @param {String} repositoryUrl The URL of the bare repository.
 * @param {String} [branch='master'] the branch to initialize.
 */
const initBareRepo = async (repositoryUrl, branch = 'master') => {
  const cwd = temporaryDirectory();
  await execa('git', ['clone', '--no-hardlinks', repositoryUrl, cwd], { cwd });
  await gitCheckout(branch, true, { cwd });
  gitCommits(['Initial commit'], { cwd });
  await execa('git', ['push', repositoryUrl, branch], { cwd });
};

/**
 * Create a temporary git repository.
 * If `withRemote` is `true`, creates a shallow clone. Change the current working directory to the clone root.
 * If `withRemote` is `false`, just change the current working directory to the repository root.
 *
 *
 * @param {Boolean} withRemote `true` to create a shallow clone of a bare repository.
 * @param {String} [branch='master'] The branch to initialize.
 * @return {String} The path of the clone if `withRemote` is `true`, the path of the repository otherwise.
 */
const initGitRepo = async (withRemote, branch = 'master') => {
  let { cwd, repositoryUrl } = await initGit(withRemote);
  if (withRemote) {
    await initBareRepo(repositoryUrl, branch);
    cwd = gitShallowClone(repositoryUrl, branch);
  } else {
    await gitCheckout(branch, true, { cwd });
  }

  await execa('git', ['config', 'commit.gpgsign', false], { cwd });

  return { cwd, repositoryUrl };
};

/**
 * Create a shallow clone of a git repository and change the current working directory to the cloned repository root.
 * The shallow will contain a limited number of commit and no tags.
 *
 * @param {String} repositoryUrl The path of the repository to clone.
 * @param {String} [branch='master'] the branch to clone.
 * @param {Number} [depth=1] The number of commit to clone.
 * @return {String} The path of the cloned repository.
 */
const gitShallowClone = (repositoryUrl, branch = 'master', depth = 1) => {
  const cwd = temporaryDirectory();

  execa(
    'git',
    [
      'clone',
      '--no-hardlinks',
      '--no-tags',
      '-b',
      branch,
      '--depth',
      depth,
      repositoryUrl,
      cwd,
    ],
    {
      cwd,
    }
  );
  return cwd;
};

/**
 * Checkout a branch on the current git repository.
 *
 * @param {String} branch Branch name.
 * @param {Boolean} create to create the branch, `false` to checkout an existing branch.
 * @param {Object} [execaOptions] Options to pass to `execa`.
 */
const gitCheckout = async (branch, create, execaOptions) => {
  await execa(
    'git',
    create ? ['checkout', '-b', branch] : ['checkout', branch],
    execaOptions
  );
};

export {
  getCommitFiles,
  getRoot,
  gitCommitsWithFiles,
  initGitRepo,
  initGit,
  initBareRepo,
};
