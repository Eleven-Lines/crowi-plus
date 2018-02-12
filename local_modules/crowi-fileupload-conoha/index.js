 'use strict';

const debug = require('debug')('crowi:lib:fileUploaderConoha')
const fs = require('fs');
const path = require('path');
const pkgcloud = require('pkgcloud');
const awsUploader = require('../crowi-fileupload-aws');

module.exports = function(crowi) {

  const getConfig = () => {
    const crowiConfig = crowi.getConfig();
    return {
      provider: 'openstack',
      username: crowiConfig.crowi['conoha:username'],
      password: crowiConfig.crowi['conoha:password'],
      authUrl: crowiConfig.crowi['conoha:identityServiceUrl'],
      region: crowiConfig.crowi['conoha:region'],
      tenantId: crowiConfig.crowi['conoha:tenantId'],
      container: crowiConfig.crowi['conoha:container'],
    }
  };

  const swiftFactory = () => {
    const Config = crowi.model('Config');
    const crowiConfig = crowi.getConfig();

    if (!Config.isUploadable(crowiConfig)) {
      throw new Error('ConoHa is not configured.');
    }
    return pkgcloud.storage.createClient(getConfig());
  };

  const createCachePath = filePath => path.join(crowi.cacheDir, filePath.replace(/\//g, '-'));

  const lib = awsUploader(crowi);

  return {
    deleteFile: (fileId, filePath) => new Promise((resolve, reject) => {
      swiftFactory().removeFile(getConfig().container, filePath, (err, result) => {
        if (err) {
          debug('Failed to delete object from conoha object storage', err);
          reject(err);
        }
        lib.clearCache(fileId);
        resolve(result);
      });
    }),

    uploadFile: (filePath, contentType, fileStream, options) => new Promise((resolve, reject) => {
      const writeStream = swiftFactory().upload({
        container: getConfig().container,
        remote: filePath,
        contentType: contentType,
      });
      writeStream.on('error', reject);
      writeStream.on('success', resolve);
      fileStream.pipe(writeStream);
    }),

    findDeliveryFile: (fileId, filePath) => new Promise((resolve, reject) => {
      const cacheFile = lib.createCacheFileName(fileId);
      debug('find delivery file', cacheFile);
      if (!lib.shouldUpdateCacheFile(cacheFile)) {
        return resolve(cacheFile);
      }
      debug('Load attachement file into local cache file', filePath, cacheFile);
      const fileStream = swiftFactory().download({
        container: getConfig().container,
        remote: filePath,
      });
      fileStream.on("error", reject);
      fileStream.on("end", _ => resolve(cacheFile));
      fileStream.pipe(fs.createWriteStream(cacheFile));
    }),

    generateUrl: filePath => `https://object-storage.${getConfig().region}.conoha.io/v1/nc_${getConfig().tenantId}/${getConfig().container}/${filePath}`,
  };
};

