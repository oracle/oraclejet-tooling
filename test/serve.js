/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

process.env = 'test';

const CONSTANTS = require('@oracle/oraclejet-tooling/lib/constants');
let fs = require('fs-extra');
let assert = require('assert');
let ojet = require('@oracle/oraclejet-tooling');
const valid = require('@oracle/oraclejet-tooling/lib/validations');
const util = require('@oracle/oraclejet-tooling/lib/util');
let cordovaDir = CONSTANTS.CORDOVA_DIRECTORY;

describe('Serve Tests: ojet.serve.<>', function ()
{ 
  it ('validatePlatform - android', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.config.loadOraclejetConfig("android");
      valid.platform('android');
    });
  });

  it ('validatePlatform - ios', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.config.loadOraclejetConfig("ios");
      valid.platform('ios')
    });
  });

  it ('validatePlatform - web', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.config.loadOraclejetConfig("web");
      valid.platform('web');
    });
  });

  it ('validatePlatform - non-existing one', () =>
  {
    assert.throws(() =>
    {
      ojet.config.loadOraclejetConfig("SpacePlatform");
      valid.platform('SpacePlatform')
    });
  });

  it ('validateBuildType - not filled = > debug', () =>
  {
    assert(valid.buildType({buildType: undefined}) == 'dev');
  });

  it ('validateBuildType - release = false', () =>
  {
    assert(valid.buildType({buildType: 'dev'}) == 'dev');
  });
  
  it ('validateBuildType - relese = true', () =>
  {
     assert(valid.buildType({buildType: 'release'}) == 'release');
  });

    it ('validateType - String', () =>
  {
    assert.doesNotThrow(() =>
    {
      util.validateType('String', "test string", 'string');
    });
  });
    it ('validateType - boolean', () =>
  {
    assert.doesNotThrow(() =>
    {
      util.validateType('boolean', true, 'boolean');
    });
  });

  it ('validateType - number', () =>
  {
    assert.doesNotThrow(() =>
    {
      util.validateType('Number', 8801, 'number');
    });
  });
});
