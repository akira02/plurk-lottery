const EventEmitter = require("events");
const fetch = require("node-fetch");
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
    await this.awaken();
    const url = setParams(this.server, {
      channel: this.channel,
      offset: this.offset,
    });
    const text = await fetch(url)
      .then(checkStatus)
      .then((r) => r.text());
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

  async awaken() {
    const url = new URL("https://www.plurk.com/_comet/generic");
    url.searchParams.set("channel", this.channel);
    await fetch(url.toString())
      .then(checkStatus)
      .then((r) => r.text());
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

function checkStatus(response) {
  if (response.ok) {
    return response;
  } else {
    const error = new Error(response.statusText);
    error.response = response;
    throw error;
  }
}

function setParams(urlString, newParams) {
  const url = new URL(urlString);
  for (const key in newParams) {
    url.searchParams.set(key, newParams[key]);
  }
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
