#! /usr/bin/env node
/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

/**
 * ## Dependencies
 */
const util = require('./util');

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

  return util.spawn(installer.installer, [installer.verbs.install, 'jsdoc@3.5.5', '--save-dev=true', '--save-exact']);
};
