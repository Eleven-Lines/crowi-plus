module.exports = function(crowi, app) {
  'use strict';

   var Page = crowi.model('Page')
    , User = crowi.model('User')
    , Revision = crowi.model('Revision')
    , Bookmark = crowi.model('Bookmark')
    , ApiResponse = require('../util/apiResponse')
    , fileUploader = require('../util/fileUploader')(crowi)
    , actions = {}
    , api = {}
    , debug = require('debug')('crowi:routes:user');

  actions.api = api;

  api.bookmarks = function(req, res) {
    var options = {
      skip: req.query.offset || 0,
      limit: req.query.limit || 50,
    };
    Bookmark.findByUser(req.user, options, function (err, bookmarks) {
      res.json(bookmarks);
    });
  };

  api.checkUsername = function(req, res) {
    var username = req.query.username;

    User.findUserByUsername(username)
    .then(function(userData) {
      if (userData) {
        return res.json({ valid: false });
      } else {
        return res.json({ valid: true });
      }
    }).catch(function(err) {
      return res.json({ valid: true });
    });
  };

  api.iconRedirector = function(req, res, next){
    const id = req.params.id;
    const ext = req.params.ext;

    fileUploader.findDeliveryFile(id, `user/${id}.${ext}`)
      .then(fileName => {
        const encodedFileName = encodeURIComponent(`user/${id}.${ext}`);

        var deliveryFile = {
          fileName: fileName,
          options: {
            headers: {
              'Content-Type': `image/${ext}`,
              'Content-Disposition': `inline;filename*=UTF-8''${encodedFileName}`,
            },
          },
        };

        if (deliveryFile.fileName.match(/^\/uploads/)) {
          debug('Using loacal file module, just redirecting.')
          return res.redirect(deliveryFile.fileName);
        } else {
          return res.sendFile(deliveryFile.fileName, deliveryFile.options);
        }
      }).catch(err => {
        debug('error', err);
      });
    // }).catch((err) => {
      //debug('err', err);
      // not found
      // debug("Attachment not found")
      // return res.status(404).sendFile(crowi.publicDir + '/images/file-not-found.png');
  };

  /**
   * @api {get} /users.list Get user list
   * @apiName GetUserList
   * @apiGroup User
   *
   * @apiParam {String} user_ids
   */
  api.list = function(req, res) {
    var userIds = req.query.user_ids || null; // TODO: handling

    var userFetcher;
    if (!userIds || userIds.split(',').length <= 0) {
      userFetcher = User.findAllUsers()
    } else {
      userFetcher = User.findUsersByIds(userIds.split(','))
    }

    userFetcher
    .then(function(userList) {
      var result = {
        users: userList,
      };

      return res.json(ApiResponse.success(result));
    }).catch(function(err) {
      return res.json(ApiResponse.error(err));
    });
  };

  return actions;
};
