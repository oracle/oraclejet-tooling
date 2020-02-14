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
 * # 'addPcss'
 *
 * @public
 * @returns {Promise}
 */
module.exports = function () {
  util.log('Performing \'npm install\'');
  config.loadOraclejetConfig();
  const sassVer = config.data.sassVer;

  return util.spawn('npm', ['install',
    `node-sass@${sassVer}`,
    'postcss-custom-properties@6.2.0',
    'postcss-calc@6.0.1',
    'autoprefixer@9.1.5',
    '--save-dev=true']);
};
