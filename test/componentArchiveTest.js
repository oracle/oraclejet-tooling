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
const zlib = require('zlib');

const AdmZip = require('adm-zip');
const admZipPackage = require('adm-zip/package.json');
const componentArchive = require('../lib/scopes/componentArchive');

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

describe('Exchange component archive safety', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ojet-component-archive-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  function writeArchive(entries) {
    const archivePath = path.join(tempDir, 'component.zip');
    const zip = new AdmZip();

    entries.forEach((entry) => {
      zip.addFile(entry.name, Buffer.from(entry.content || ''));
    });
    zip.writeZip(archivePath);
    return archivePath;
  }

  function writeRawArchive(entries) {
    let offset = 0;
    const localRecords = [];
    const centralRecords = [];

    entries.forEach((entry) => {
      const entryName = Buffer.from(entry.name);
      const content = Buffer.from(entry.content || '');
      const declaredUncompressedSize = entry.uncompressedSize === undefined ?
        content.length : entry.uncompressedSize;
      const declaredCompressedSize = entry.compressedSize === undefined ?
        content.length : entry.compressedSize;
      const compressionMethod = entry.compressionMethod || 0;
      const crc32 = entry.crc32 || 0;
      const externalAttributes = entry.externalAttributes < 0 ?
        entry.externalAttributes + 0x100000000 : entry.externalAttributes || 0;
      const localHeader = Buffer.alloc(30);
      const centralHeader = Buffer.alloc(46);

      localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(compressionMethod, 8);
      localHeader.writeUInt32LE(crc32, 14);
      localHeader.writeUInt32LE(declaredCompressedSize, 18);
      localHeader.writeUInt32LE(declaredUncompressedSize, 22);
      localHeader.writeUInt16LE(entryName.length, 26);

      centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
      centralHeader.writeUInt16LE(0x0314, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(compressionMethod, 10);
      centralHeader.writeUInt32LE(crc32, 16);
      centralHeader.writeUInt32LE(declaredCompressedSize, 20);
      centralHeader.writeUInt32LE(declaredUncompressedSize, 24);
      centralHeader.writeUInt16LE(entryName.length, 28);
      centralHeader.writeUInt32LE(externalAttributes, 38);
      centralHeader.writeUInt32LE(offset, 42);

      localRecords.push(localHeader, entryName, content);
      centralRecords.push(centralHeader, entryName);
      offset += localHeader.length + entryName.length + content.length;
    });

    const centralDirectory = Buffer.concat(centralRecords);
    const endOfCentralDirectory = Buffer.alloc(22);
    endOfCentralDirectory.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
    endOfCentralDirectory.writeUInt16LE(entries.length, 8);
    endOfCentralDirectory.writeUInt16LE(entries.length, 10);
    endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
    endOfCentralDirectory.writeUInt32LE(offset, 16);

    const archivePath = path.join(tempDir, 'raw-component.zip');
    fs.writeFileSync(archivePath, Buffer.concat([
      ...localRecords,
      centralDirectory,
      endOfCentralDirectory
    ]));
    return archivePath;
  }

  function createDeflatedPayload(uncompressedBytes) {
    return new Promise((resolve, reject) => {
      const deflater = zlib.createDeflateRaw();
      const compressedChunks = [];
      const sourceChunk = Buffer.alloc(1024 * 1024);
      let remainingBytes = uncompressedBytes;

      deflater.on('data', data => compressedChunks.push(data));
      deflater.once('error', reject);
      deflater.once('end', () => resolve(Buffer.concat(compressedChunks)));

      function writeNextChunk() {
        while (remainingBytes > 0) {
          const bytesToWrite = Math.min(remainingBytes, sourceChunk.length);
          remainingBytes -= bytesToWrite;
          if (!deflater.write(sourceChunk.slice(0, bytesToWrite))) {
            deflater.once('drain', writeNextChunk);
            return;
          }
        }
        deflater.end();
      }

      writeNextChunk();
    });
  }

  async function writeUnderdeclaredDeflateArchive() {
    const compressedData = await createDeflatedPayload(
      componentArchive.MAX_ARCHIVE_UNCOMPRESSED_BYTES + (1024 * 1024)
    );
    return writeRawArchive([{
      name: 'underdeclared-bomb.bin',
      content: compressedData,
      compressedSize: compressedData.length,
      uncompressedSize: 1,
      compressionMethod: 8
    }]);
  }

  function assertDestinationIsUnchanged(destinationPath) {
    assert.equal(fs.readFileSync(path.join(destinationPath, 'sentinel.txt'), 'utf8'), 'keep');
  }

  it('requires adm-zip 0.6.0 or newer', () => {
    const [major, minor] = admZipPackage.version.split('.').map(Number);

    assert.ok(
      major > 0 || minor >= 6,
      'adm-zip 0.6.0 or newer is required for Exchange component archive extraction'
    );
  });

  it('installs a valid archive into an empty component directory', async () => {
    const archivePath = writeArchive([
      { name: 'component.json', content: '{"name":"demo-card"}' },
      { name: 'types/demo-card.d.ts', content: 'export {};\n' }
    ]);
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-card');

    await componentArchive.installArchive(archivePath, destinationPath, false);

    assert.equal(fs.readFileSync(path.join(destinationPath, 'component.json'), 'utf8'), '{"name":"demo-card"}');
    assert.equal(fs.readFileSync(path.join(destinationPath, 'types', 'demo-card.d.ts'), 'utf8'), 'export {};\n');
  });

  [
    '../outside.txt',
    '..\\outside.txt',
    '/outside.txt',
    'C:\\outside.txt'
  ].forEach((entryName) => {
    it(`rejects unsafe archive entry '${entryName}' before replacing a component`, async () => {
      const archivePath = writeRawArchive([{ name: entryName, content: 'blocked' }]);
      const destinationPath = path.join(tempDir, 'jet_components', 'demo-card');
      fs.ensureDirSync(destinationPath);
      fs.writeFileSync(path.join(destinationPath, 'sentinel.txt'), 'keep');

      await assert.rejects(
        () => componentArchive.installArchive(archivePath, destinationPath, false),
        /Blocked Exchange archive entry/
      );
      assertDestinationIsUnchanged(destinationPath);
      assert.equal(fs.existsSync(path.join(tempDir, 'outside.txt')), false);
    });
  });

  it('rejects ZIP symbolic-link entries before modifying the destination', async () => {
    const archivePath = writeRawArchive([{
      name: 'link-outside',
      content: '../outside.txt',
      externalAttributes: 0o120777 * 0x10000
    }]);
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-card');
    fs.ensureDirSync(destinationPath);
    fs.writeFileSync(path.join(destinationPath, 'sentinel.txt'), 'keep');

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, destinationPath, false),
      /unsupported file type/
    );
    assertDestinationIsUnchanged(destinationPath);
  });

  it('rejects an oversized declared entry before adm-zip extracts it', async () => {
    const archivePath = writeRawArchive([{
      name: 'large-file.bin',
      content: 'x',
      uncompressedSize: 3 * 1024 * 1024 * 1024
    }]);
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-card');

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, destinationPath, false),
      /exceeding/
    );
    assert.equal(fs.existsSync(destinationPath), false);
  });

  it('rejects an archive whose declared total uncompressed size exceeds the limit', async () => {
    const entrySize = componentArchive.MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES;
    const entries = Array.from({ length: 6 }, (_, index) => ({
      name: `entry-${index}.bin`,
      uncompressedSize: entrySize
    }));
    const archivePath = writeRawArchive(entries);

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, path.join(tempDir, 'jet_components', 'demo-card'), false),
      /uncompressed bytes/
    );
  });

  it('rejects duplicate archive paths', async () => {
    const archivePath = writeRawArchive([
      { name: 'component.json', content: '{}' },
      { name: 'component.json', content: '{}' }
    ]);

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, path.join(tempDir, 'jet_components', 'demo-card'), false),
      /duplicate entry/
    );
  });

  it('preserves installed pack components while replacing pack resources', async () => {
    const archivePath = writeArchive([
      { name: 'component.json', content: '{"name":"demo-pack"}' },
      { name: 'min/pack.js', content: 'new resource' }
    ]);
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-pack');
    fs.ensureDirSync(path.join(destinationPath, 'demo-card'));
    fs.writeFileSync(path.join(destinationPath, 'demo-card', 'component.json'), '{"name":"demo-card"}');
    fs.writeFileSync(path.join(destinationPath, 'demo-card', 'keep.js'), 'keep');
    fs.writeFileSync(path.join(destinationPath, 'stale.txt'), 'remove');

    await componentArchive.installArchive(archivePath, destinationPath, true);

    assert.equal(fs.readFileSync(path.join(destinationPath, 'component.json'), 'utf8'), '{"name":"demo-pack"}');
    assert.equal(fs.readFileSync(path.join(destinationPath, 'min', 'pack.js'), 'utf8'), 'new resource');
    assert.equal(fs.readFileSync(path.join(destinationPath, 'demo-card', 'keep.js'), 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(destinationPath, 'stale.txt')), false);
  });

  it('refuses an existing pack with a symbolic link instead of following it', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }

    const archivePath = writeArchive([{ name: 'component.json', content: '{"name":"demo-pack"}' }]);
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-pack');
    const outsidePath = path.join(tempDir, 'outside');
    fs.ensureDirSync(destinationPath);
    fs.ensureDirSync(outsidePath);
    fs.writeFileSync(path.join(outsidePath, 'sentinel.txt'), 'keep');
    fs.symlinkSync(outsidePath, path.join(destinationPath, 'legacy-link'), 'dir');

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, destinationPath, true),
      /symbolic link/
    );
    assert.equal(fs.readFileSync(path.join(outsidePath, 'sentinel.txt'), 'utf8'), 'keep');
  });

  it('refuses to replace a component directory that is itself a symbolic link', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }

    const archivePath = writeArchive([{ name: 'component.json', content: '{"name":"demo-card"}' }]);
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-card');
    const outsidePath = path.join(tempDir, 'outside');
    fs.ensureDirSync(path.dirname(destinationPath));
    fs.ensureDirSync(outsidePath);
    fs.writeFileSync(path.join(outsidePath, 'sentinel.txt'), 'keep');
    fs.symlinkSync(outsidePath, destinationPath, 'dir');

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, destinationPath, false),
      /symbolic link/
    );
    assert.equal(fs.readFileSync(path.join(outsidePath, 'sentinel.txt'), 'utf8'), 'keep');
  });

  it('bounds an underdeclared DEFLATE archive by actual output on Node 14', async function () {
    this.timeout(30000);
    const archivePath = await writeUnderdeclaredDeflateArchive();
    const destinationPath = path.join(tempDir, 'jet_components', 'demo-card');
    const initialRss = process.memoryUsage().rss;

    await assert.rejects(
      () => componentArchive.installArchive(archivePath, destinationPath, false),
      /actual uncompressed bytes/
    );

    const memoryIncreaseMB = (process.memoryUsage().rss - initialRss) / (1024 * 1024);
    assert.ok(memoryIncreaseMB < 128, `Expected bounded memory use, observed ${memoryIncreaseMB.toFixed(1)} MiB.`);
    assert.equal(fs.existsSync(destinationPath), false);
    assert.deepEqual(fs.readdirSync(path.dirname(destinationPath)), []);
  });
});
