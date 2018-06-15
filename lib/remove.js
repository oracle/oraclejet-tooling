#! /usr/bin/env node
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
const component = require('./scopes/component');
const CONSTANTS = require('./constants');
const util = require('./util');

/**
 * # Switch for 'ojet.remove()'
 *
 * @public
 * @param {string} scope
 * @param {Array} parameters
 * @param {boolean} isStrip
 * @returns {Promise}
 */
module.exports = function (scope, parameters, isStrip) {
  switch (scope) {
    case (CONSTANTS.API_SCOPES.COMPONENT):
      return component.remove(parameters, isStrip);
    default:
      util.log.error(`Please specify ojet.${CONSTANTS.API_TASKS.REMOVE}() 'scope' parameter.`);
      return false;
  }
};
