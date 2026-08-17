/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

/* eslint-disable no-bitwise */

const fs = require('fs-extra');
const path = require('path');
const { Readable, Transform, pipeline } = require('stream');
const { promisify } = require('util');
const zlib = require('zlib');

const AdmZip = require('adm-zip');
const CONSTANTS = require('../constants');

// Exchange archives are already limited to 250 MiB while downloading. Keep the
// expanded content within the same bound and avoid materialising a single huge
// entry in adm-zip's synchronous extraction API.
const MAX_ARCHIVE_ENTRIES = 10000;
const MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const UNIX_DIRECTORY_TYPE = 0o040000;
const UNIX_REGULAR_FILE_TYPE = 0o100000;
const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATED = 8;
const pipelineAsync = promisify(pipeline);
const CRC32_TABLE = _createCrc32Table();

/**
 * Installs an Exchange component archive without allowing archive entries or
 * existing destination symlinks to escape the intended component root.
 *
 * @param {string} archivePath Path to the downloaded archive.
 * @param {string} destinationPath Component or pack destination directory.
 * @param {boolean} preservePackComponents Whether this is a pack update.
 * @returns {void}
 */
async function installArchive(archivePath, destinationPath, preservePackComponents) {
  let stagingPath;

  try {
    stagingPath = await _extractArchiveToStaging(archivePath, path.dirname(destinationPath));
    if (preservePackComponents) {
      _mergeStagedPack(stagingPath, destinationPath);
    } else {
      _replaceComponentWithStaging(stagingPath, destinationPath);
      stagingPath = undefined;
    }
  } finally {
    if (stagingPath) {
      removePathNoFollow(stagingPath);
    }
  }
}

/**
 * Throws when a directory tree includes a symbolic link. Existing component
 * content can have been created by an older vulnerable extraction path, so it
 * must be checked before code enumerates, removes, or merges it.
 *
 * @param {string} source Path to inspect.
 * @param {string} label Description used in the error message.
 * @returns {void}
 */
function assertNoSymbolicLinks(source, label) {
  const sourceStat = _lstatIfExists(source);
  if (!sourceStat) {
    return;
  }
  _assertNoSymbolicLinks(source, label);
}

/**
 * Removes a file, symbolic link, or directory tree without following links.
 *
 * @param {string} source Path to remove.
 * @returns {void}
 */
function removePathNoFollow(source) {
  const sourceStat = _lstatIfExists(source);
  if (!sourceStat) {
    return;
  }

  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    fs.unlinkSync(source);
    return;
  }

  fs.readdirSync(source).forEach((entryName) => {
    removePathNoFollow(path.join(source, entryName));
  });
  fs.rmdirSync(source);
}

/**
 * Checks whether a path exists, including a dangling symbolic link.
 *
 * @param {string} source Path to inspect.
 * @returns {boolean} Whether the path exists.
 */
function pathExists(source) {
  return Boolean(_lstatIfExists(source));
}

async function _extractArchiveToStaging(archivePath, stagingParentPath) {
  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries();
  _validateEntries(entries);

  fs.ensureDirSync(stagingParentPath);
  const stagingPath = fs.mkdtempSync(path.join(stagingParentPath, '.ojet-component-archive-'));
  let totalUncompressedBytes = 0;

  try {
    await entries.reduce((sequence, entry) => sequence.then(async () => {
      if (entry.isDirectory) {
        fs.ensureDirSync(path.join(stagingPath, entry.entryName));
      } else {
        totalUncompressedBytes = await _extractEntryToStaging(
          entry,
          stagingPath,
          totalUncompressedBytes
        );
      }
    }), Promise.resolve());
    _assertNoSymbolicLinks(stagingPath, 'staged Exchange archive');
    return stagingPath;
  } catch (error) {
    removePathNoFollow(stagingPath);
    throw error;
  }
}

function _validateEntries(entries) {
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`Blocked Exchange archive with more than ${MAX_ARCHIVE_ENTRIES} entries.`);
  }

  const entryTypes = new Map();
  const containerPaths = new Set();
  let totalUncompressedBytes = 0;

  entries.forEach((entry) => {
    const entryPath = _validateEntryPath(entry.entryName, entry.isDirectory);
    const uncompressedSize = entry.header.size;
    const compressedSize = entry.header.compressedSize;

    _assertSafeEntryType(entry, entryPath);
    if (!Number.isSafeInteger(uncompressedSize) || uncompressedSize < 0) {
      throw new Error(`Blocked Exchange archive entry '${entry.entryName}' with an invalid size.`);
    }
    if (!Number.isSafeInteger(compressedSize) || compressedSize < 0) {
      throw new Error(`Blocked Exchange archive entry '${entry.entryName}' with an invalid compressed size.`);
    }
    if (entry.header.encrypted ||
      (entry.header.method !== ZIP_METHOD_STORED && entry.header.method !== ZIP_METHOD_DEFLATED)) {
      throw new Error(`Blocked Exchange archive entry '${entry.entryName}' with unsupported compression.`);
    }
    if (uncompressedSize > MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(`Blocked Exchange archive entry '${entry.entryName}' exceeding ${MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES} bytes.`);
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error(`Blocked Exchange archive exceeding ${MAX_ARCHIVE_UNCOMPRESSED_BYTES} uncompressed bytes.`);
    }

    if (entryTypes.has(entryPath)) {
      throw new Error(`Blocked Exchange archive with duplicate entry '${entry.entryName}'.`);
    }
    if (!entry.isDirectory && containerPaths.has(entryPath)) {
      throw new Error(`Blocked Exchange archive entry '${entry.entryName}' conflicts with a child entry.`);
    }

    const pathSegments = entryPath.split('/');
    let parentPath = '';
    pathSegments.slice(0, -1).forEach((segment) => {
      parentPath = parentPath ? `${parentPath}/${segment}` : segment;
      if (entryTypes.get(parentPath) === 'file') {
        throw new Error(`Blocked Exchange archive entry '${entry.entryName}' below file '${parentPath}'.`);
      }
      containerPaths.add(parentPath);
    });
    entryTypes.set(entryPath, entry.isDirectory ? 'directory' : 'file');
  });
}

async function _extractEntryToStaging(entry, stagingPath, totalUncompressedBytes) {
  const destinationPath = path.join(stagingPath, entry.entryName);
  const compressedData = entry.getCompressedData();

  if (compressedData.length !== entry.header.compressedSize) {
    throw new Error(`Blocked Exchange archive entry '${entry.entryName}' with truncated compressed data.`);
  }
  fs.ensureDirSync(path.dirname(destinationPath));

  if (entry.header.method === ZIP_METHOD_STORED) {
    return _writeStoredEntry(entry, compressedData, destinationPath, totalUncompressedBytes);
  }
  return _inflateEntryToFile(entry, compressedData, destinationPath, totalUncompressedBytes);
}

function _writeStoredEntry(entry, compressedData, destinationPath, totalUncompressedBytes) {
  const nextState = _recordExtractedBytes(entry, compressedData.length, 0, totalUncompressedBytes);
  _assertCrc32(entry, _crc32(compressedData));
  fs.writeFileSync(destinationPath, compressedData, { flag: 'wx', mode: 0o666 });
  _assertDeclaredSize(entry, compressedData.length);
  return nextState.totalUncompressedBytes;
}

async function _inflateEntryToFile(entry, compressedData, destinationPath, totalUncompressedBytes) {
  let actualSize = 0;
  let entryUncompressedBytes = 0;
  let actualTotalUncompressedBytes = totalUncompressedBytes;
  const crc32 = _createCrc32();
  const destinationStream = fs.createWriteStream(destinationPath, { flags: 'wx', mode: 0o666 });
  const destinationStreamClosed = new Promise((resolve) => {
    if (destinationStream.closed) {
      resolve();
    } else {
      destinationStream.once('close', resolve);
    }
  });
  const limitAndCrc = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const nextState = _recordExtractedBytes(
          entry,
          chunk.length,
          entryUncompressedBytes,
          actualTotalUncompressedBytes
        );
        entryUncompressedBytes = nextState.entryUncompressedBytes;
        actualTotalUncompressedBytes = nextState.totalUncompressedBytes;
        actualSize += chunk.length;
        crc32.update(chunk);
        callback(null, chunk);
      } catch (error) {
        callback(error);
      }
    }
  });

  try {
    await pipelineAsync(
      Readable.from([compressedData]),
      zlib.createInflateRaw(),
      limitAndCrc,
      destinationStream
    );
  } finally {
    await destinationStreamClosed;
  }
  _assertDeclaredSize(entry, actualSize);
  _assertCrc32(entry, crc32.value());
  return actualTotalUncompressedBytes;
}

function _recordExtractedBytes(entry, bytes, entryUncompressedBytes, totalUncompressedBytes) {
  if (bytes > MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES - entryUncompressedBytes) {
    throw new Error(`Blocked Exchange archive entry '${entry.entryName}' exceeding ${MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES} actual uncompressed bytes.`);
  }
  if (bytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES - totalUncompressedBytes) {
    throw new Error(`Blocked Exchange archive exceeding ${MAX_ARCHIVE_UNCOMPRESSED_BYTES} actual uncompressed bytes.`);
  }
  return {
    entryUncompressedBytes: entryUncompressedBytes + bytes,
    totalUncompressedBytes: totalUncompressedBytes + bytes
  };
}

function _assertDeclaredSize(entry, actualSize) {
  if (actualSize !== entry.header.size) {
    throw new Error(`Blocked Exchange archive entry '${entry.entryName}' with mismatched uncompressed size.`);
  }
}

function _assertCrc32(entry, actualCrc32) {
  const expectedCrc32 = entry.header.crc < 0 ? entry.header.crc + 0x100000000 : entry.header.crc;
  if (actualCrc32 !== expectedCrc32) {
    throw new Error(`Blocked Exchange archive entry '${entry.entryName}' with invalid CRC32.`);
  }
}

function _createCrc32Table() {
  return Array.from({ length: 256 }, (unused, value) => {
    let crc = value;
    Array.from({ length: 8 }).forEach(() => {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    });
    return crc >>> 0;
  });
}

function _createCrc32() {
  let crc = 0xffffffff;

  return {
    update(data) {
      data.forEach((byte) => {
        crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      });
    },
    value() {
      return (crc ^ 0xffffffff) >>> 0;
    }
  };
}

function _crc32(data) {
  const crc32 = _createCrc32();
  crc32.update(data);
  return crc32.value();
}

function _validateEntryPath(entryName, isDirectory) {
  if (typeof entryName !== 'string' || !entryName || entryName.includes('\0')) {
    throw new Error('Blocked Exchange archive with an invalid entry name.');
  }
  if (entryName.includes('\\') || path.posix.isAbsolute(entryName) ||
    path.win32.isAbsolute(entryName) || /^[A-Za-z]:/.test(entryName)) {
    throw new Error(`Blocked Exchange archive entry '${entryName}' outside the component directory.`);
  }

  const pathSegments = entryName.split('/');
  const trailingDirectorySeparator = isDirectory && pathSegments[pathSegments.length - 1] === '';
  const segmentsToValidate = trailingDirectorySeparator ? pathSegments.slice(0, -1) : pathSegments;
  if (!segmentsToValidate.length || segmentsToValidate.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Blocked Exchange archive entry '${entryName}' outside the component directory.`);
  }

  const normalizedPath = path.posix.normalize(entryName).replace(/\/$/, '');
  if (!normalizedPath || normalizedPath === '.' || normalizedPath === '..' || normalizedPath.startsWith('../')) {
    throw new Error(`Blocked Exchange archive entry '${entryName}' outside the component directory.`);
  }
  return normalizedPath;
}

function _assertSafeEntryType(entry, entryPath) {
  const externalAttributes = entry.header.attr < 0 ?
    entry.header.attr + 0x100000000 : entry.header.attr;
  const unixMode = Math.floor(externalAttributes / 0x10000) % 0x10000;
  const unixFileType = Math.floor(unixMode / 0o10000) * 0o10000;

  if (unixFileType && unixFileType !== UNIX_DIRECTORY_TYPE &&
    unixFileType !== UNIX_REGULAR_FILE_TYPE) {
    throw new Error(`Blocked Exchange archive entry '${entryPath}' with an unsupported file type.`);
  }
}

function _replaceComponentWithStaging(stagingPath, destinationPath) {
  if (pathExists(destinationPath)) {
    assertNoSymbolicLinks(destinationPath, `existing component '${destinationPath}'`);
    removePathNoFollow(destinationPath);
  }
  fs.renameSync(stagingPath, destinationPath);
}

function _mergeStagedPack(stagingPath, destinationPath) {
  if (pathExists(destinationPath)) {
    assertNoSymbolicLinks(destinationPath, `existing pack '${destinationPath}'`);
    _removePackResources(destinationPath);
  } else {
    fs.ensureDirSync(destinationPath);
  }
  fs.copySync(stagingPath, destinationPath, { overwrite: true });
}

function _removePackResources(destinationPath) {
  fs.readdirSync(destinationPath).forEach((entryName) => {
    const entryPath = path.join(destinationPath, entryName);
    const entryStat = fs.lstatSync(entryPath);

    if (!entryStat.isDirectory()) {
      removePathNoFollow(entryPath);
    } else if (!fs.existsSync(path.join(entryPath, CONSTANTS.JET_COMPONENT_JSON))) {
      removePathNoFollow(entryPath);
    }
  });
}

function _assertNoSymbolicLinks(source, label) {
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Blocked ${label} containing symbolic link '${source}'. Remove the link before installing components.`);
  }
  if (sourceStat.isDirectory()) {
    fs.readdirSync(source).forEach((entryName) => {
      _assertNoSymbolicLinks(path.join(source, entryName), label);
    });
  }
}

function _lstatIfExists(source) {
  try {
    return fs.lstatSync(source);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

module.exports = {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  assertNoSymbolicLinks,
  installArchive,
  pathExists,
  removePathNoFollow
};
