/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const exchange = require('../lib/scopes/exchange');
const util = require('../lib/util');
const exchangeUtils = require('../lib/utils.exchange');

describe('Exchange request encoding', () => {
  const original = {};

  beforeEach(() => {
    original.request = util.request;
    original.checkForHttpErrors = util.checkForHttpErrors;
    original.convertJsonToObject = util.convertJsonToObject;
    original.getRequestedComponentVersion = util.getRequestedComponentVersion;
    original.getPlainComponentName = util.getPlainComponentName;
    original.ensureParameters = util.ensureParameters;
    original.setSessionOptions = util.setSessionOptions;
    original.loginIfCredentialsProvided = util.loginIfCredentialsProvided;
    original.getExchangeUrl = exchangeUtils.getExchangeUrl;
    original.validateAuthenticationOfRequest = exchangeUtils.validateAuthenticationOfRequest;

    util.checkForHttpErrors = () => {};
    util.ensureParameters = () => {};
    util.setSessionOptions = () => {};
    util.loginIfCredentialsProvided = () => Promise.resolve();
    exchangeUtils.getExchangeUrl = () => 'https://exchange.example.com/api';
    exchangeUtils.validateAuthenticationOfRequest = (response, repeat, callback) => callback();
  });

  afterEach(() => {
    util.request = original.request;
    util.checkForHttpErrors = original.checkForHttpErrors;
    util.convertJsonToObject = original.convertJsonToObject;
    util.getRequestedComponentVersion = original.getRequestedComponentVersion;
    util.getPlainComponentName = original.getPlainComponentName;
    util.ensureParameters = original.ensureParameters;
    util.setSessionOptions = original.setSessionOptions;
    util.loginIfCredentialsProvided = original.loginIfCredentialsProvided;
    exchangeUtils.getExchangeUrl = original.getExchangeUrl;
    exchangeUtils.validateAuthenticationOfRequest = original.validateAuthenticationOfRequest;
  });

  it('should encode component metadata path segments', async () => {
    let requestOptions;
    util.getPlainComponentName = () => 'pack/name?x=1';
    util.getRequestedComponentVersion = () => '1.0.0/beta#frag';
    util.convertJsonToObject = () => ({ version: '1.0.0' });
    util.request = (options) => {
      requestOptions = options;
      return Promise.resolve({
        response: { statusCode: 200, headers: {} },
        responseBody: '{}'
      });
    };

    await exchangeUtils.getComponentMetadata('pack/name@1.0.0/beta#frag');

    assert.strictEqual(
      requestOptions.path,
      '/components/pack%2Fname%3Fx%3D1/versions/1.0.0%2Fbeta%23frag'
    );
  });

  it('should encode label query values', async () => {
    let requestOptions;
    util.request = (options) => {
      requestOptions = options;
      return Promise.resolve({
        response: { statusCode: 200, headers: {} },
        responseBody: '{"items":[]}'
      });
    };

    await exchangeUtils.listComponentsWithGivenLabels({ labels: 'safe&admin=true' });

    assert.strictEqual(
      requestOptions.useUrl,
      'https://exchange.example.com/api/components?' +
        'format=compact&q=label%3Asafe%26admin%3Dtrue.json'
    );
  });

  it('should encode upload label query values', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exchange-upload-'));
    const archivePath = path.join(tempDir, 'component.zip');
    let requestOptions;
    fs.writeFileSync(archivePath, 'test');
    util.request = (options) => {
      requestOptions = options;
      return Promise.resolve({
        response: { statusCode: 200, headers: {} },
        responseBody: '{}'
      });
    };

    try {
      await exchangeUtils.uploadToExchange('component', {
        labels: 'safe&admin=true, second',
        path: archivePath
      });

      assert.strictEqual(
        requestOptions.path,
        '/components/?access=PUBLIC&labels=safe%26admin%3Dtrue%2Csecond'
      );
    } finally {
      fs.removeSync(tempDir);
    }
  });

  it('should encode add-label component path segments', async () => {
    let requestOptions;
    util.request = (options) => {
      requestOptions = options;
      return Promise.resolve({
        response: { statusCode: 200, headers: {} },
        responseBody: '{}'
      });
    };

    await exchangeUtils.addComponentLabel({
      name: 'pack/name?x=1',
      version: '1.0.0/beta#frag'
    }, 'prod');

    assert.strictEqual(
      requestOptions.useUrl,
      'https://exchange.example.com/api/components/pack%2Fname%3Fx%3D1/' +
        'versions/1.0.0%2Fbeta%23frag/labels'
    );
  });

  it('should encode search query values', async () => {
    let requestOptions;
    util.request = (options) => {
      requestOptions = options;
      return Promise.resolve({
        response: { statusCode: 200, headers: {} },
        responseBody: '{"items":[]}'
      });
    };

    await exchange.search('button&format=full', {});

    assert.strictEqual(
      requestOptions.path,
      '/components/?q=button%26format%3Dfull*&format=compact&extraFields=tags&' +
        'componentFields=displayName%2Cdescription'
    );
  });
});
