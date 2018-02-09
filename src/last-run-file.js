const fs = require('fs');
const { resolve } = require('path');
const { promisify } = require('util');
const readPkg = require('read-pkg');
const { getHead } = require('./git-utils');
const debug = require('debug')('semantic-release:monorepo');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const FILE_PATH = resolve(process.env.HOME, '.semantic-release-monorepo');

const readLastRunHead = async () => {
  try {
    debug('Trying to read last-run HEAD from %s', FILE_PATH);
    const packages = await readLastRunFile();
    const { name } = await readPkg();
    const hash = packages[name];

    if (hash) {
      debug('Last ran against package %s at %s', name, hash);
    } else {
      debug('No "last-run" found for package %s', name);
    }

    return hash;
  } catch (error) {
    debug(error);
    return undefined;
  }
};

const writeLastRunHead = async () => {
  try {
    debug('Trying to write HEAD to last-run to %s', FILE_PATH);
    const packages = await readLastRunFile();
    const { name } = await readPkg();
    packages[name] = await getHead();
    await writeFile(FILE_PATH, JSON.stringify(packages));
  } catch (error) {
    debug(error);
  }
};

const readLastRunFile = async () => {
  try {
    return JSON.parse(await readFile(FILE_PATH));
  } catch (err) {
    return {};
  }
};

module.exports = {
  readLastRunHead,
  writeLastRunHead,
};
