/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const ojet = require('../oraclejet-tooling');
const _ = require('lodash');

describe('Config Test', () => {
  it('should init empty config', () => {
    ojet.config();
    assert(_.isEmpty(ojet.config()));
  });

  it('should init non-empty config', () => {
    ojet.config('name', 'test1');
    assert(ojet.config('name') === 'test1');
  });

  it('should get config', () => {
    assert(ojet.config('name'), 'test1');
  });

  it('should get entire config', () => {
    assert(ojet.config(), { name: 'test1' });
  });

  it('should set config', () => {
    ojet.config('value', '123');
    assert(ojet.config('value'), '123');
  });

  it('should overwrite config', () => {
    ojet.config('value', '1234');
    assert(ojet.config('value'), '1234');
  });
});

