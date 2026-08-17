/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const fs = require('fs');

const constants = require('../lib/constants');
const exchangeUtils = require('../lib/utils.exchange');
const util = require('../lib/util');

describe('Credential environment safety', () => {
  describe('session options', () => {
    afterEach(() => {
      util.setSessionOptions({});
      delete process.env.options;
    });

    it('should keep CLI options out of process.env', () => {
      util.setSessionOptions({ username: 'user', password: 'secret' });

      assert.equal(util.getOptionsProperty('username'), 'user');
      assert.equal(util.getOptionsProperty('password'), 'secret');
      assert.equal(process.env.options, undefined);
    });

    it('should update session options without serializing to process.env', () => {
      util.setSessionOptions({ username: 'user', password: 'secret' });
      util.updateSessionOptions({ secure: false });

      assert.deepStrictEqual(util.getSessionOptions(), {
        username: 'user',
        password: 'secret',
        secure: false
      });
      assert.equal(process.env.options, undefined);
    });
  });

  describe('exchange auth token storage', () => {
    const original = {};

    beforeEach(() => {
      original.getExchangeUrl = exchangeUtils.getExchangeUrl;
      original.readJsonAndReturnObject = util.readJsonAndReturnObject;
      original.writeObjectAsJsonFile = util.writeObjectAsJsonFile;
      original.ensureDir = util.ensureDir;
      original.existsSync = fs.existsSync;
      original.chmodSync = fs.chmodSync;
      delete process.env.accessTokenMap;
    });

    afterEach(() => {
      exchangeUtils.getExchangeUrl = original.getExchangeUrl;
      util.readJsonAndReturnObject = original.readJsonAndReturnObject;
      util.writeObjectAsJsonFile = original.writeObjectAsJsonFile;
      util.ensureDir = original.ensureDir;
      fs.existsSync = original.existsSync;
      fs.chmodSync = original.chmodSync;
      delete process.env.accessTokenMap;
    });

    it('should write auth info with owner-only permissions and no env cache', () => {
      const exchangeUrl = 'https://exchange-write.example.test';
      let writeCall;
      const calls = [];

      exchangeUtils.getExchangeUrl = () => exchangeUrl;
      util.ensureDir = () => {};
      util.readJsonAndReturnObject = () => ({});
      fs.existsSync = () => true;
      util.writeObjectAsJsonFile = (file, object, options) => {
        writeCall = { file, object, options };
        calls.push({ type: 'write', file, object, options });
      };
      fs.chmodSync = (file, mode) => {
        calls.push({ type: 'chmod', file, mode });
      };
      process.env.accessTokenMap = 'legacy-token-cache';

      exchangeUtils.writeAuthInfoToFS({
        [constants.EXCHANGE_AUTH_ACCESS_TOKEN]: 'token-value',
        [constants.EXCHANGE_AUTH_EXPIRES_IN]: 60
      });

      assert.equal(writeCall.options.mode, 0o600);
      assert.deepStrictEqual(calls.map((call) => call.type), ['chmod', 'write', 'chmod']);
      assert.equal(calls[0].file, writeCall.file);
      assert.equal(calls[0].mode, 0o600);
      assert.equal(calls[2].file, writeCall.file);
      assert.equal(calls[2].mode, 0o600);
      assert.equal(writeCall.object[exchangeUrl][constants.EXCHANGE_AUTH_ACCESS_TOKEN], 'token-value');
      assert.equal(process.env.accessTokenMap, undefined);
    });

    it('should read auth info without populating process.env', () => {
      const exchangeUrl = 'https://exchange-read.example.test';
      exchangeUtils.getExchangeUrl = () => exchangeUrl;
      util.readJsonAndReturnObject = () => ({
        [exchangeUrl]: {
          [constants.EXCHANGE_AUTH_ACCESS_TOKEN]: 'token-value',
          [constants.EXCHANGE_AUTH_EXPIRATION_CLIENT]: Date.now() + (5 * 60 * 1000)
        }
      });
      process.env.accessTokenMap = 'legacy-token-cache';

      const authInfo = exchangeUtils.readAuthInfoFromFS();

      assert.equal(authInfo[constants.EXCHANGE_AUTH_ACCESS_TOKEN], 'token-value');
      assert.equal(process.env.accessTokenMap, undefined);
    });
  });
});
