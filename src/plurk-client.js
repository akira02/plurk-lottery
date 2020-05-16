const querystring = require("querystring");
const { OAuth } = require("oauth");

module.exports = class PlurkClient {
  constructor(options) {
    this.options = options;
    this.oauth = new OAuth(
      "https://www.plurk.com/OAuth/request_token",
      "https://www.plurk.com/OAuth/access_token",
      options.consumerKey,
      options.consumerSecret,
      "1.0",
      null,
      "HMAC-SHA1"
    );
  }

  async request(path, params) {
    const query = querystring.stringify(params);
    const url = `https://www.plurk.com${path}?${query}`;
    const json = await new Promise((resolve, reject) => {
      this.oauth.get(
        url,
        this.options.token,
        this.options.tokenSecret,
        (err, data) => {
          if (err) {
            return reject(err);
          }
          resolve(data);
        }
      );
    });
    return JSON.parse(json);
  }
};
