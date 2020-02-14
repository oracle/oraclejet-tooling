#! /usr/bin/env node
/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
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
 * @returns {Promise}
 */
module.exports = function () {
  config.loadOraclejetConfig();
  const sassVer = config.data.sassVer;
  util.log('Performing \'npm install node-sass\'');
  return util.spawn('npm', ['install', `node-sass@${sassVer}`, '--save-dev=true']);
};
