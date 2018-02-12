'use strict';

var form = require('express-form')
  , field = form.field;

module.exports = form(
  field('settingForm[conoha:region]', 'リージョン').trim(),
  field('settingForm[conoha:username]', 'APIユーザー名').trim(),
  field('settingForm[conoha:password]', 'パスワード').trim(),
  field('settingForm[conoha:identityServiceUrl]', 'Identity Service URL').trim(),
  field('settingForm[conoha:tenantId]', 'テナントID').trim(),
  field('settingForm[conoha:container]', 'コンテナ').trim()
);
