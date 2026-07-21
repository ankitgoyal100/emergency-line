'use strict';

exports.handler = function (_context, _event, callback) {
  // Inbound human-authored text is intentionally never relayed. SMS, when
  // separately registered and enabled, is limited to application-generated
  // missed-call and voicemail notifications from the voice callback.
  // Return a MessagingResponse object—not an XML-looking string—so the Twilio
  // Functions runtime serializes this as text/xml. A plain string is served as
  // text/plain and can be sent back to the caller as literal message content.
  return callback(null, new Twilio.twiml.MessagingResponse());
};
