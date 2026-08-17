/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const ojetUtil = require('../lib/util');

const util = require('../lib/util');

describe('Util Test', () => {
  it('should have templatePath', () => {
    const template = util.templatePath('');
    assert(template === path.resolve('../oraclejet-tooling'));
  });

  it('should have destPath', () => {
    const template = util.destPath('test1');
    assert(template === path.resolve('test1'));
  });

  describe('symbolic link safety', () => {
    it('should remove a symbolic link without deleting its target', function () {
      if (process.platform === 'win32') {
        this.skip();
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ojet-util-symlink-'));
      const outsidePath = path.join(tempDir, 'outside');
      const linkPath = path.join(tempDir, 'component');
      try {
        fs.ensureDirSync(outsidePath);
        fs.writeFileSync(path.join(outsidePath, 'sentinel.txt'), 'keep');
        fs.symlinkSync(outsidePath, linkPath, 'dir');

        util.deleteDirSync(linkPath);

        assert.equal(fs.existsSync(linkPath), false);
        assert.equal(fs.readFileSync(path.join(outsidePath, 'sentinel.txt'), 'utf8'), 'keep');
      } finally {
        fs.removeSync(tempDir);
      }
    });

    it('should not classify symbolic links as files or directories', function () {
      if (process.platform === 'win32') {
        this.skip();
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ojet-util-symlink-'));
      const outsideDir = path.join(tempDir, 'outside-dir');
      const outsideFile = path.join(tempDir, 'outside-file.txt');
      try {
        fs.ensureDirSync(path.join(tempDir, 'directory'));
        fs.writeFileSync(path.join(tempDir, 'file.txt'), 'file');
        fs.ensureDirSync(outsideDir);
        fs.writeFileSync(outsideFile, 'outside');
        fs.symlinkSync(outsideDir, path.join(tempDir, 'directory-link'), 'dir');
        fs.symlinkSync(outsideFile, path.join(tempDir, 'file-link.txt'), 'file');

        assert.deepStrictEqual(util.getDirectories(tempDir), ['directory', 'outside-dir']);
        assert.deepStrictEqual(util.getFiles(tempDir), ['file.txt', 'outside-file.txt']);
      } finally {
        fs.removeSync(tempDir);
      }
    });
  });

  describe('Config Test', () => {
    it('should expect false for isCCaSassFile', () => {
      assert(ojetUtil.isCcaSassFile('testApp/staged-themes/redwood/web/redwood.css') === false);
    });
  
    it('should expect true for isCCaSassFile', () => {
      assert(ojetUtil.isCcaSassFile('jet-composites/mytheme.css') == true);
    });
  });

  describe('collectReturnStatements', () => {
    it('should collect object return with required props', () => {
      const code = `function webpack() { return { context, webpack: config }; }`;
      const returns = util.collectReturnStatements(code);
      const objectReturns = returns.filter(r => r.type === 'object');
      assert.ok(objectReturns.length >= 1);
      const props = objectReturns[0].properties;
      assert.ok(props.includes('context'));
      assert.ok(props.includes('webpack'));
    });

    it('should collect non-object returns (literal)', () => {
      const code = `function webpack() { return 42; }`;
      const returns = util.collectReturnStatements(code);
      const literals = returns.filter(r => r.type === 'number');
      assert.ok(literals.length >= 1);
    });

    it('should collect multiple return paths', () => {
      const code = `function webpack(x){ if(x){ return { context, webpack: config }; } return 0; }`;
      const returns = util.collectReturnStatements(code);
      assert.ok(returns.length >= 2);
    });

    it('should collect concise arrow implicit object returns', () => {
      const code = `const webpack = ({context, config}) => ({ context, webpack: config });`;
      const returns = util.collectReturnStatements(code);
      const objectReturns = returns.filter(r => r.type === 'object');
      assert.ok(objectReturns.length >= 1);
      const props = objectReturns[0].properties;
      assert.ok(props.includes('context'));
      assert.ok(props.includes('webpack'));
    });
  });

  describe('install args', () => {
    it('should split dependency strings into package args', () => {
      assert.deepStrictEqual(
        util.splitDependencyArgs('typescript@5.8.3 && touch /tmp/pwned'),
        ['typescript@5.8.3', '&&', 'touch', '/tmp/pwned']
      );
    });

    it('should flatten dependency arrays into package args', () => {
      assert.deepStrictEqual(
        util.splitDependencyArgs(['webpack@5.101.0 html-webpack-plugin', 'copy-webpack-plugin']),
        ['webpack@5.101.0', 'html-webpack-plugin', 'copy-webpack-plugin']
      );
    });

    it('should accept valid dependency specs', () => {
      assert.equal(util.isValidDependencySpec('typescript@5.8.3'), true);
      assert.equal(util.isValidDependencySpec('@types/node@18.16.3'), true);
      assert.equal(util.isValidDependencySpec('@prefresh/webpack'), true);
      assert.equal(util.isValidDependencySpec('yargs-parser@~13.1.2'), true);
      assert.equal(util.isValidDependencySpec('eslint@^8.57.0'), true);
      assert.equal(util.isValidDependencySpec('postcss@latest'), true);
      assert.equal(util.isValidDependencySpec('@oracle/oraclejet@21.0.0-beta.1+build.1'), true);
    });

    it('should reject malformed dependency specs', () => {
      assert.equal(util.isValidDependencySpec('&&'), false);
      assert.equal(util.isValidDependencySpec(';'), false);
      assert.equal(util.isValidDependencySpec('../tmp/pwned'), false);
      assert.equal(util.isValidDependencySpec('foo\\bar'), false);
      assert.equal(util.isValidDependencySpec('--legacy-peer-deps'), false);
      assert.equal(util.isValidDependencySpec(
        'https://artifacthub-phx.oci.oraclecorp.com/ojet-dev-local/' +
          'oracle-oraclejet-jest-preset-21.0.0.tgz'
      ), false);
      assert.equal(util.isValidDependencySpec('https://example.com/package.tgz?cache=1'), false);
      assert.equal(util.isValidDependencySpec('some-package@https://example.com/package.tgz'), false);
      assert.equal(util.isValidDependencySpec('some-package@file:../tmp/pwned'), false);
      assert.equal(util.isValidDependencySpec('some-package@git+https://example.com/repo.git'), false);
      assert.equal(util.isValidDependencySpec('some-package@../tmp/pwned'), false);
      assert.equal(util.isValidDependencySpec('some-package@/tmp/pwned'), false);
    });

    it('should build install args for valid dependency specs', () => {
      const installer = {
        installer: 'npm',
        verbs: { install: 'install' },
        flags: {
          save: '--save-dev',
          exact: '--save-exact',
          legacy: '--legacy-peer-deps'
        }
      };

      assert.deepStrictEqual(
        util.getInstallArgs({
          installer,
          dependencies: 'typescript@5.8.3 @types/node@18.16.3',
          enableLegacyPeerDeps: true
        }),
        [
          'install',
          'typescript@5.8.3',
          '@types/node@18.16.3',
          '--save-dev',
          '--save-exact',
          '--legacy-peer-deps'
        ]
      );
    });

    it('should reject invalid dependency specs when building install args', () => {
      const installer = {
        installer: 'npm',
        verbs: { install: 'install' },
        flags: {
          save: '--save-dev',
          exact: '--save-exact',
          legacy: '--legacy-peer-deps'
        }
      };

      assert.throws(
        () => util.getInstallArgs({
          installer,
          dependencies: 'typescript@5.8.3 && touch /tmp/pwned',
          enableLegacyPeerDeps: false
        }),
        /Invalid dependency spec '&&' found in oraclejetconfig\.json\./
      );
    });

    it('should allow explicitly trusted remote tarball specs', () => {
      const installer = {
        installer: 'npm',
        verbs: { install: 'install' },
        flags: {
          save: '--save-dev',
          exact: '--save-exact',
          legacy: '--legacy-peer-deps'
        }
      };
      const trustedTarballRegex = new RegExp(
        '^https://artifacthub-phx\\.oci\\.oraclecorp\\.com/ojet-dev-local/' +
        'oracle-oraclejet-jest-preset-' +
        '[0-9]+(?:\\.[0-9]+)+(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?\\.tgz$'
      );
      const trustedTarball = 'https://artifacthub-phx.oci.oraclecorp.com/ojet-dev-local/' +
        'oracle-oraclejet-jest-preset-21.0.0.tgz';

      assert.deepStrictEqual(
        util.getInstallArgs({
          installer,
          dependencies: trustedTarball,
          allowedRemoteTarballRegex: trustedTarballRegex
        }),
        [
          'install',
          trustedTarball,
          '--save-dev',
          '--save-exact'
        ]
      );
    });

    it('should reject dangerous characters before applying trusted tarball specs', () => {
      const trustedTarballRegex = new RegExp(
        '^https://artifacthub-phx\\.oci\\.oraclecorp\\.com/ojet-dev-local/' +
        'oracle-oraclejet-jest-preset-' +
        '[0-9]+(?:\\.[0-9]+)+(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?\\.tgz$'
      );

      assert.equal(util.isValidDependencySpec(
        'https://artifacthub-phx.oci.oraclecorp.com/ojet-dev-local/' +
          'oracle-oraclejet-jest-preset-21.0.0;touch.tgz',
        { allowedRemoteTarballRegex: trustedTarballRegex }
      ), false);
      assert.equal(util.isValidDependencySpec(
        'https://artifacthub-phx.oci.oraclecorp.com/ojet-dev-local/' +
          'oracle-oraclejet-jest-preset-21.0.0$evil.tgz',
        { allowedRemoteTarballRegex: trustedTarballRegex }
      ), false);
    });
  });

  describe('spawn errors', () => {
    it('should preserve stderr when a child process fails', async () => {
      const stderr = 'webpack dependency installation failed';

      await assert.rejects(
        () => util.spawn(
          process.execPath,
          ['-e', `process.stderr.write('${stderr}'); process.exit(7);`],
          undefined,
          false
        ),
        error => error.code === 7
          && error.stderr === stderr
          && error.message.includes(stderr)
      );
    });
  });

  describe('spawn config', () => {
    it('should spawn commands directly without a shell on non-Windows platforms', () => {
      const config = util.getSpawnConfig({
        command: 'npm',
        options: ['install', 'typescript@5.8.3'],
        platform: 'darwin',
        env: { PATH: '/usr/bin' }
      });

      assert.strictEqual(config.cmd, 'npm');
      assert.deepStrictEqual(config.args, ['install', 'typescript@5.8.3']);
      assert.strictEqual(config.options.shell, false);
      assert.strictEqual(config.options.env.NO_UPDATE_NOTIFIER, true);
      assert.strictEqual(config.options.windowsVerbatimArguments, undefined);
    });

    it('should run Windows command shims through cmd.exe without shell mode', () => {
      const config = util.getSpawnConfig({
        command: 'npm',
        options: ['install', 'typescript@5.8.3', '--save-dev'],
        platform: 'win32',
        env: {
          ComSpec: 'C:\\Windows\\System32\\cmd.exe',
          PATH: 'C:\\Windows\\System32'
        }
      });

      assert.strictEqual(config.cmd, 'C:\\Windows\\System32\\cmd.exe');
      assert.deepStrictEqual(config.args, [
        '/d',
        '/s',
        '/c',
        '"npm ^"install^" ^"typescript@5.8.3^" ^"--save-dev^""'
      ]);
      assert.strictEqual(config.options.shell, false);
      assert.strictEqual(config.options.windowsVerbatimArguments, true);
    });

    it('should route explicit Windows command scripts through cmd.exe', () => {
      const cmdConfig = util.getSpawnConfig({
        command: 'npm.cmd',
        options: ['install'],
        platform: 'win32',
        env: {}
      });
      const batConfig = util.getSpawnConfig({
        command: 'tools\\run-build.bat',
        options: ['--release'],
        platform: 'win32',
        env: {}
      });

      assert.strictEqual(cmdConfig.cmd, 'cmd.exe');
      assert.deepStrictEqual(cmdConfig.args, [
        '/d',
        '/s',
        '/c',
        '"npm.cmd ^"install^""'
      ]);
      assert.strictEqual(cmdConfig.options.shell, false);
      assert.strictEqual(cmdConfig.options.windowsVerbatimArguments, true);

      assert.strictEqual(batConfig.cmd, 'cmd.exe');
      assert.deepStrictEqual(batConfig.args, [
        '/d',
        '/s',
        '/c',
        '"tools\\run-build.bat ^"--release^""'
      ]);
      assert.strictEqual(batConfig.options.shell, false);
      assert.strictEqual(batConfig.options.windowsVerbatimArguments, true);
    });

    it('should quote and escape Windows cmd metacharacters in structured arguments', () => {
      const config = util.getSpawnConfig({
        command: 'npm',
        options: ['install', 'safe-package@1.0.0&calc', '%PATH%'],
        platform: 'win32',
        env: {}
      });

      assert.deepStrictEqual(config.args, [
        '/d',
        '/s',
        '/c',
        '"npm ^"install^" ^"safe-package@1.0.0^&calc^" ^"^%PATH^%^""'
      ]);
      assert.strictEqual(config.options.shell, false);
    });

    it('should preserve npm version ranges containing a caret in Windows command arguments', () => {
      const config = util.getSpawnConfig({
        command: 'npm',
        options: ['install', 'regenerator-runtime@^0.13.9'],
        platform: 'win32',
        env: {}
      });

      assert.deepStrictEqual(config.args, [
        '/d',
        '/s',
        '/c',
        '"npm ^"install^" ^"regenerator-runtime@^^0.13.9^""'
      ]);
    });

    it('should merge explicit spawn env over process env', () => {
      const config = util.getSpawnConfig({
        command: 'npm',
        options: ['install'],
        spawnOptions: {
          cwd: 'tools',
          env: { NODE_ENV: 'development' }
        },
        platform: 'darwin',
        env: {
          NODE_ENV: 'production',
          PATH: '/usr/bin'
        }
      });

      assert.strictEqual(config.options.cwd, 'tools');
      assert.strictEqual(config.options.env.NODE_ENV, 'development');
      assert.strictEqual(config.options.env.PATH, '/usr/bin');
      assert.strictEqual(config.options.env.NO_UPDATE_NOTIFIER, true);
    });

    it('should preserve literal argv values when running Windows command scripts', async function () {
      if (process.platform !== 'win32') {
        return;
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ojet-spawn-'));
      const nodeScript = path.join(tempDir, 'argv.js');
      const cmdScript = path.join(tempDir, 'argv.cmd');
      const outputFile = path.join(tempDir, 'argv.json');
      const literalArgs = [
        '&',
        '|',
        '%',
        '!',
        '(x)',
        'with space',
        '"quoted"',
        'regenerator-runtime@^0.13.9',
        ''
      ];
      // Batch scripts expose numbered parameters only through %9. Keep the
      // output path in the Node helper so every forwarded value fits in %1-%9.
      assert.ok(literalArgs.length <= 9, 'Windows batch fixture exceeds numbered parameters');
      const forwardedArgs = Array.from(
        { length: literalArgs.length },
        (_, index) => `"%~${index + 1}"`
      ).join(' ');

      try {
        fs.writeFileSync(
          nodeScript,
          [
            'const fs = require("fs");',
            `fs.writeFileSync(${JSON.stringify(outputFile)}, JSON.stringify(process.argv.slice(2)));`,
            ''
          ].join('\n')
        );
        fs.writeFileSync(
          cmdScript,
          '@echo off\r\n' +
          'setlocal DisableDelayedExpansion\r\n' +
          `"${process.execPath}" "${nodeScript}" ${forwardedArgs}\r\n`
        );

        await util.spawn(cmdScript, literalArgs, undefined, false);

        assert.deepStrictEqual(
          JSON.parse(fs.readFileSync(outputFile, 'utf8')),
          literalArgs
        );
      } finally {
        fs.removeSync(tempDir);
      }
    });
  });
});
