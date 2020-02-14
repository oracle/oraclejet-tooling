/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
/**
 * # Tooling for Oracle JET apps
 * - - -
 * *This is the description. See more at [Oracle JET](http://oraclejet.org) website.*
 */

'use strict';

/**
 * Expose ojet object
 */
const ojet = module.exports;

const CONSTANTS = require('./lib/constants');

/**
 * Expose libraries
 */
[
  CONSTANTS.API_TASKS.ADD,
  CONSTANTS.API_TASKS.ADDSASS,
  'build',
  'clean',
  'config',
  CONSTANTS.API_TASKS.CONFIGURE,
  CONSTANTS.API_TASKS.CREATE,
  CONSTANTS.API_TASKS.LIST,
  CONSTANTS.API_TASKS.ADDPCSS,  
  CONSTANTS.API_TASKS.PUBLISH,
  CONSTANTS.API_TASKS.REMOVE,
  CONSTANTS.API_TASKS.SEARCH,
  CONSTANTS.API_TASKS.ADDTYPESCRIPT,
  'serve',
  'strip'
].forEach((name) => {
  ojet[name] = require('./lib/' + name); // eslint-disable-line
});

// Instantiate Package class
const PackageClass = require('./lib/' + CONSTANTS.API_TASKS.PACKAGE);
const packageInstance = new PackageClass();
// Expose ojet.package()
ojet[CONSTANTS.API_TASKS.PACKAGE] = packageInstance.package;

/**
 * Expose other objects
 */
ojet.package.json = require('./package.json');

ojet.version = ojet.package.version;
