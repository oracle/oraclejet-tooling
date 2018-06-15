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
 * # Switch for 'ojet.add()'
 *
 * @public
 * @param {string} scope
 * @param {Array} parameters

 * @returns {Promise}
 */
module.exports = function (scope, parameters) {
  switch (scope) {
    case (CONSTANTS.API_SCOPES.COMPONENT):
      return component.add(parameters);
    default:
      util.log.error(`Please specify ojet.${CONSTANTS.API_TASKS.ADD}() 'scope' parameter.`);
      return false;
  }
};
