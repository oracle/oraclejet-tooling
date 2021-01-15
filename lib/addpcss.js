#! /usr/bin/env node
/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
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
    'postcss-calc@6.0.1',
    'autoprefixer@9.1.5',
    '--save-dev=true']);
};
