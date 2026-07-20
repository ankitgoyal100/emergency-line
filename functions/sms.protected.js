'use strict';

exports.handler = function (_context, _event, callback) {
  // Inbound human-authored text is intentionally never relayed. SMS, when
  // separately registered and enabled, is limited to application-generated
  // missed-call and voicemail notifications from the voice callback.
  return callback(null, '<Response/>');
};
