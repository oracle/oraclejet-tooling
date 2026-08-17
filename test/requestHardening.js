/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');
const http = require('http');

const util = require('../lib/util');
const exchangeUtils = require('../lib/utils.exchange');

describe('Request hardening', () => {
  const originalExchangeUtils = {};

  beforeEach(() => {
    originalExchangeUtils.getAccessTokenFromFS = exchangeUtils.getAccessTokenFromFS;
    originalExchangeUtils.getExchangeUrl = exchangeUtils.getExchangeUrl;
    process.env.options = '{}';
  });

  afterEach(() => {
    exchangeUtils.getAccessTokenFromFS = originalExchangeUtils.getAccessTokenFromFS;
    exchangeUtils.getExchangeUrl = originalExchangeUtils.getExchangeUrl;
    delete process.env.options;
  });

  it('should construct request options using WHATWG URL parsing', async () => {
    const { server, url } = await listen((request, response) => {
      assert.strictEqual(request.url, '/exchange/components?q=button');
      response.writeHead(200);
      response.end('ok');
    });
    exchangeUtils.getAccessTokenFromFS = () => null;
    exchangeUtils.getExchangeUrl = () => `${url}/exchange/`;

    try {
      const result = await util.request({
        path: '/components?q=button',
        secure: false,
        requestIdleTimeoutMs: 1000
      });

      assert.strictEqual(result.responseBody, 'ok');
    } finally {
      await close(server);
    }
  });

  it('should reject when Content-Length exceeds the configured maximum', async () => {
    const { server, url } = await listen((request, response) => {
      response.writeHead(200, { 'Content-Length': 10 });
      response.end('too large');
    });
    exchangeUtils.getAccessTokenFromFS = () => null;

    try {
      await assert.rejects(
        util.request({
          useUrl: url,
          secure: false,
          maxResponseBytes: 5,
          requestIdleTimeoutMs: 1000
        }),
        /maximum size of 5 bytes/
      );
    } finally {
      await close(server);
    }
  });

  it('should reject when streamed response data exceeds the configured maximum', async () => {
    const { server, url } = await listen((request, response) => {
      response.writeHead(200);
      response.write('12345');
      response.end('67890');
    });
    exchangeUtils.getAccessTokenFromFS = () => null;

    try {
      await assert.rejects(
        util.request({
          useUrl: url,
          secure: false,
          maxResponseBytes: 5,
          requestIdleTimeoutMs: 1000
        }),
        /maximum size of 5 bytes/
      );
    } finally {
      await close(server);
    }
  });
});

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}
