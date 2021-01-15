/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

const CONSTANTS = require('./constants');
const glob = require('glob');
const fs = require('fs-extra');
const util = require('./util');
const path = require('path');

const _ = {};
_.union = require('lodash.union');
_.difference = require('lodash.difference');

function _getGitIgnore() {
  const pathTogGitIgnore = util.destPath('.gitignore');
  if (util.fsExistsSync(pathTogGitIgnore)) {
    return util.readFileSync(pathTogGitIgnore).split(/\r?\n/);
  }
  util.log.warning('No .gitignore file found.  No files will be cleaned');
  return [];
}

function _getCleanFileList(ignoreList) {
  let fileList = [];
  ignoreList.forEach((file) => {
    if (file.length !== 0 && !/Thumbs\.db|\.DS_Store/.test(file)) {
      const exclusion = file.indexOf('!') === 0;
      let srcPattern = exclusion ? file.slice(1) : file;
      // .gitignore file pattern may start with '/', remove it for glob matching
      srcPattern = srcPattern[0] === '/' ? srcPattern.slice(1) : srcPattern;
      const match = glob.sync(util.destPath(srcPattern), { cwd: util.destPath() });
      if (exclusion) {
        fileList = _.difference(fileList, match);
      } else {
        fileList = _.union(fileList, match);
      }
    }
  });
  return fileList;
}

module.exports = function strip() {
  const fileList = _getCleanFileList(_getGitIgnore());
  return new Promise((resolve, reject) => {
    fileList.forEach((file) => {
      if (path.extname(file) === '') {
        fs.emptyDirSync(file);
        fs.removeSync(file);
      } else {
        fs.remove(file, (err) => {
          if (err) reject(err);
        });
      }
    });

    // ToDo: Remove in v10+
    // If an app was created with 8+ tooling, 'jet_components' gets removed
    // with tooling.strip() above. As utils.deleteDir generally does not
    // log errors for non existing folder(s), we can call it.
    // Keep it here until v10+ because apps created with <8.0.0 tooling
    // does not have 'jet_components' in .gitignore
    util.deleteDirSync(path.join(process.cwd(), CONSTANTS.JET_COMPONENTS_DIRECTORY));

    resolve();
  });
};
