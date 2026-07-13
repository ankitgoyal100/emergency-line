'use strict';

const { optionalInstanceId } = require('./validate.js');

// With no INSTANCE_ID, retain the original tags so existing installations do
// not buy duplicate numbers. New installations should set an instance ID.
function getTags(instanceId) {
  const id = optionalInstanceId(instanceId);
  const base = id ? `emergency-line-${id}` : 'emergency-line';
  return {
    active: `${base}-active`,
    test: `${base}-test`,
    provisional: `${base}-active-provisional`,
    retired: `${base}-active-retired`,
    isLegacy: !id,
  };
}

module.exports = { getTags };
