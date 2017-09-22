/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

process.env = 'test';

const CONSTANTS = require('../lib/constants');
let fs = require('fs');
let assert = require('assert');
let ojet = require('../oraclejet-tooling');

let cordovaDir = CONSTANTS.CORDOVA_DIRECTORY;

describe('Serve Tests: ojet.serve.<>', function ()
{
  before(() =>
  {
    ojet.serve.exposePrivateFunctions();
    //create Cordova directory
    
    if (!fs.existsSync(cordovaDir)) 
    {
      fs.mkdirSync(cordovaDir)
    }
  });

  after(() => 
  {
    fs.rmdirSync(cordovaDir);
  });
  
  it ('validatePlatform - android', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.serve.validatePlatform('android')
    });
  });

  it ('validatePlatform - ios', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.serve.validatePlatform('ios')
    });
  });

  it ('validatePlatform - web', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.serve.validatePlatform('web')
    });
  });

  it ('validatePlatform - browser', () =>
  {
    assert.doesNotThrow(() =>
    {
      ojet.serve.validatePlatform('browser')
    });
  });

  it ('validatePlatform - non-existing one', () =>
  {
    assert.throws(() =>
    {
      ojet.serve.validatePlatform('SpacePlatform')
    });
  });

  it ('setDefaultPlatform', () =>
  {
    assert(ojet.serve.setDefaultPlatform() == 'web' || 'browser');
  });

  it ('validateBuildType - not filled = > debug', () =>
  {
    assert(ojet.serve.validateBuildType() == 'debug');
  });

  it ('validateBuildType - release = false', () =>
  {
    assert(ojet.serve.validateBuildType(undefined, false) == 'debug');
  });
  
  it ('validateBuildType - relese = true', () =>
  {
    assert(ojet.serve.validateBuildType(undefined, true) == 'release');
  });

  it ('validateType - boolean', () =>
  {
    assert(ojet.serve.validateType('Boolean', true, 'boolean') == true);
  });

  it ('validateType - string', () =>
  {
    assert(ojet.serve.validateType('String', 'someString', 'string') == true);
  });

  it ('cdToCordovaDirectory', () =>
  {
    let oldPath = process.cwd();
    ojet.serve.cdToCordovaDirectory()
    let newPath = process.cwd();
    assert(oldPath + '/' + cordovaDir == newPath);
  });

  it ('cdFromCordovaDirectory', () =>
  {
    let oldPath = process.cwd();
    ojet.serve.cdFromCordovaDirectory()
    let newPath = process.cwd();
    assert(oldPath == newPath + '/' + cordovaDir);
  });
});
