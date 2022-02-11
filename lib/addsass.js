#! /usr/bin/env node
/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
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
 * # 'addSass'
 *
 * @public
 * @param {Object} options
 * @returns {Promise}
 */
module.exports = function (options) {
  config.loadOraclejetConfig();
  const sassVer = config.data.sassVer;
  const installer = util.getInstallerCommand({ options });

  util.log('Installing node-sass');
  return util.spawn(installer.installer, [installer.verbs.install, `node-sass@${sassVer}`, '--save-dev=true']);
};
