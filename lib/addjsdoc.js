#! /usr/bin/env node
/**
  Copyright (c) 2015, 2025, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

/**
 * ## Dependencies
 */
const util = require('./util');
const config = require('./config');

/**
 * # 'addJsdoc'
 *
 * @public
 * @param {Object} options
 * @returns {Promise}
 */
module.exports = function (options) {
  util.log('Installing jsdoc');
  const installer = util.getInstallerCommand({ options });
  const jsdocLibraries = config.data.jsdocLibraries;

  return util.spawn(
    installer.installer,
    [
      installer.verbs.install,
      jsdocLibraries,
      installer.flags.save,
      installer.flags.exact
    ]
  );
};
