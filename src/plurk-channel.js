const EventEmitter = require("events");
const fetch = require("node-fetch");
const querystring = require("querystring");
const { URL } = require("url");

module.exports = class PlurkChannel extends EventEmitter {
  constructor(server, channel) {
    super({ captureRejections: true });
    this.server = server;
    this.channel = channel;
    this.offset = 0;
  }

  async poll(options) {
    const defaultOptions = {
      retry: true,
      retryDelay: 3000,
    };

    options = { ...defaultOptions, ...options };

    while (true) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.emit("error", err);
        if (!options.retry) {
          break;
        }
        await delay(options.retryDelay);
      }
    }
  }

  async pollOnce() {
    const url = setParams(this.server, {
      channel: this.channel,
      offset: this.offset,
    });
    const text = await fetch(url).then((r) => r.text());
    const response = parseResponse(text);
    if (response.new_offset >= 0) {
      this.offset = response.new_offset;
    } else if (response.new_offset === -3) {
      this.offset = 0;
    }
    if (response.data != null) {
      for (const data of response.data) {
        this.handleNewData(data);
      }
    }
  }

  handleNewData(data) {
    switch (data.type) {
      case "new_response":
        this.emit("response", data);
        break;
      case "new_plurk":
        this.emit("plurk", data);
        break;
    }
  }
};

function setParams(urlString, newParams) {
  const url = new URL(urlString);
  const oldParams = querystring.parse(url.search);
  const newQuery = querystring.stringify({ ...oldParams, ...newParams });
  url.search = newQuery;
  return url.toString();
}

function parseResponse(text) {
  const match = text.match(/^CometChannel\.scriptCallback\((.*)\);$/);
  const json = match[1];
  return JSON.parse(json);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
