module.exports = function(crowi, app) {
  'use strict';

  var debug = require('debug')('crowi:routes:login-passport')
    , passport = require('passport')
    , config = crowi.getConfig()
    , Config = crowi.model('Config')
    , ExternalAccount = crowi.model('ExternalAccount')
    , User = crowi.model('User')
    , passportService = crowi.passportService
    ;

  /**
   * success handler
   * @param {*} req
   * @param {*} res
   */
  const loginSuccess = (req, res, user) => {
    // update lastLoginAt
    user.updateLastLoginAt(new Date(), (err, userData) => {
      if (err) {
        console.log(`updateLastLoginAt dumps error: ${err}`);
        debug(`updateLastLoginAt dumps error: ${err}`);
      }
    });

    var jumpTo = req.session.jumpTo;
    if (jumpTo) {
      req.session.jumpTo = null;
      return res.redirect(jumpTo);
    } else {
      return res.redirect('/');
    }
  };

  /**
   * failure handler
   * @param {*} req
   * @param {*} res
   */
  const loginFailure = (req, res, next) => {
    req.flash('errorMessage', 'Sign in failure.');
    return res.redirect('/login');
  };

  /**
   * return true(valid) or false(invalid)
   *
   *  true ... group filter is not defined or the user has one or more groups
   *  false ... group filter is defined and the user has any group
   *
   */
  function isValidLdapUserByGroupFilter(user) {
    let bool = true;
    if (user._groups != null) {
      if (user._groups.length == 0) {
        bool = false;
      }
    }
    return bool;
  }
  /**
   * middleware that login with LdapStrategy
   * @param {*} req
   * @param {*} res
   * @param {*} next
   */
  const loginWithLdap = (req, res, next) => {
    if (!passportService.isLdapStrategySetup) {
      debug('LdapStrategy has not been set up');
      return next();
    }

    const loginForm = req.body.loginForm;

    if (!req.form.isValid) {
      debug("invalid form");
      return res.render('login', {
      });
    }

    passport.authenticate('ldapauth', (err, ldapAccountInfo, info) => {
      if (res.headersSent) {  // dirty hack -- 2017.09.25
        return;               // cz: somehow passport.authenticate called twice when ECONNREFUSED error occurred
      }

      debug('--- authenticate with LdapStrategy ---');
      debug('ldapAccountInfo', ldapAccountInfo);
      debug('info', info);

      if (err) {  // DB Error
        console.log('LDAP Server Error: ', err);
        req.flash('warningMessage', 'LDAP Server Error occured.');
        return next(); // pass and the flash message is displayed when all of authentications are failed.
      }

      // authentication failure
      if (!ldapAccountInfo) { return next(); }
      // check groups
      if (!isValidLdapUserByGroupFilter(ldapAccountInfo)) {
        return loginFailure(req, res, next);
      }

      /*
       * authentication success
       */
      // it is guaranteed that username that is input from form can be acquired
      // because this processes after authentication
      const ldapAccountId = passportService.getLdapAccountIdFromReq(req);

      const attrMapUsername = passportService.getLdapAttrNameMappedToUsername();
      const usernameToBeRegistered = ldapAccountInfo[attrMapUsername];

      // find or register(create) user
      ExternalAccount.findOrRegister('ldap', ldapAccountId, usernameToBeRegistered)
        .then((externalAccount) => {
          return externalAccount.getPopulatedUser();
        })
        .then((user) => {
          // login
          req.logIn(user, (err) => {
            if (err) { return next(); }
            else {
              return loginSuccess(req, res, user);
            }
          });
        })
        .catch((err) => {
          if (err.name != null && err.name === 'DuplicatedUsernameException') {
            req.flash('isDuplicatedUsernameExceptionOccured', true);
            return next();
          }
          else {
            return next(err);
          }
        });

    })(req, res, next);
  }

  /**
   * middleware that test credentials with LdapStrategy
   *
   * @param {*} req
   * @param {*} res
   */
  const testLdapCredentials = (req, res) => {
    if (!passportService.isLdapStrategySetup) {
      debug('LdapStrategy has not been set up');
      return res.json({
        status: 'warning',
        message: 'LdapStrategy has not been set up',
      });
    }

    const loginForm = req.body.loginForm;

    passport.authenticate('ldapauth', (err, user, info) => {
      if (res.headersSent) {  // dirty hack -- 2017.09.25
        return;               // cz: somehow passport.authenticate called twice when ECONNREFUSED error occurred
      }

      if (err) {  // DB Error
        console.log('LDAP Server Error: ', err);
        return res.json({
          status: 'warning',
          message: 'LDAP Server Error occured.',
        });
      }
      if (info && info.message) {
        return res.json({
          status: 'warning',
          message: info.message,
        });
      }
      if (user) {
        // check groups
        if (!isValidLdapUserByGroupFilter(user)) {
          return res.json({
            status: 'warning',
            message: 'The user is found, but that has no groups.',
          });
        }
        return res.json({
          status: 'success',
          message: 'Successfully authenticated.',
        });
      }
    })(req, res, () => {});
  }

  /**
   * middleware that login with LocalStrategy
   * @param {*} req
   * @param {*} res
   * @param {*} next
   */
  const loginWithLocal = (req, res, next) => {
    const loginForm = req.body.loginForm;

    if (!req.form.isValid) {
      return res.render('login', {
      });
    }

    passport.authenticate('local', (err, user, info) => {
      debug('--- authenticate with LocalStrategy ---');
      debug('user', user);
      debug('info', info);

      if (err) {  // DB Error
        console.log('Database Server Error: ', err);
        req.flash('warningMessage', 'Database Server Error occured.');
        return next(); // pass and the flash message is displayed when all of authentications are failed.
      }
      if (!user) { return next(); }
      req.logIn(user, (err) => {
        if (err) { return next(); }
        else {
          return loginSuccess(req, res, user);
        }
      });
    })(req, res, next);
  }

  const testMikanCredentials = (req, res) => {
    if (!passportService.isMikanStrategySetup) {
      debug('MikanStrategy has not been set up');
      return res.json({
        status: 'warning',
        message: 'MikanStrategy has not been set up',
      });
    }
    passport.authenticate('cookie', (err, user, info) => {
      debug('mikanAccountInfo', user);
      if (err) {
        console.log('Mikan Server Error: ', err);
        return res.json({
          status: 'warning',
          message: 'Mikan Server Error occured.',
        });
      }
      if (info && info.message) {
        return res.json({
          status: 'warning',
          message: info.message,
        });
      }
      if (user) {
        if (user.username === req.body.loginForm.username) {
          return res.json({
            status: 'success',
            message: 'Successfully authenticated.',
          });
        } else {
          return res.json({
            status: 'danger',
            message: `Authentication failed.`,
          });
        }
      }
    })(req, res, () => {});
}
  const loginWithMikan = (req, res, next) => {
    if (!passportService.isMikanStrategySetup) {
      debug('MikanStrategy has not been set up');
      return next();
    }

    passport.authenticate('cookie', (err, mikanAccountInfo, info) => {
      debug('--- authenticate with MikanStrategy ---');
      debug('mikanAccountInfo', mikanAccountInfo);
      debug('info', info);

      if (err) {
        console.log('Mikan authentication Error: ', err);
        req.flash('warningMessage', ' Error occured while authentication with Mikan.');
        return next(); // pass and the flash message is displayed when all of authentications are failed.
      }

      // authentication failure
      if (!mikanAccountInfo) { return next(); }

      /*
       * authentication success
       */
      // it is guaranteed that username that is input from form can be acquired
      // because this processes after authentication
      const mikanUid = mikanAccountInfo.uid;
      const mikanUsername = mikanAccountInfo.username;

      // find or register(create) user
      ExternalAccount.findOrRegister('mikan', mikanUid, mikanUsername)
        .then((externalAccount) => {
          return externalAccount.getPopulatedUser();
        })
        .then((user) => {
          // update user status
          try {
            user.email = mikanAccountInfo.email;
          } catch (e) {
            user.email = User.generateRandomEmail;
          }
          user.name = `${mikanAccountInfo.first_name} ${mikanAccountInfo.last_name}`;
          user.admin = mikanAccountInfo.is_staff;
          user.image = mikanAccountInfo.profile_image;
          // login
          req.logIn(user, (err) => {
            if (err) { return next(); }
            else {
              return loginSuccess(req, res, user);
            }
          });
        })
        .catch((err) => {
          if (err.name != null && err.name === 'DuplicatedUsernameException') {
            req.flash('isDuplicatedUsernameExceptionOccured', true);
            return next();
          }
          else {
            return next(err);
          }
        });

    })(req, res, next);
  }

  return {
    loginFailure,
    loginWithLdap,
    testLdapCredentials,
    loginWithLocal,
    loginWithMikan,
    testMikanCredentials,
  };
};
