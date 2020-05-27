const PlurkClient = require("./plurk-client");
const PlurkChannel = require("./plurk-channel");
const MatchingQueue = require("./matching-queue");

const config = require("../config");

async function main() {
  const client = initPlurkClient();
  const queue = initMatchingQueue();
  const channel = await initPlurkChannel(client);
  const botData = await client.request("/APP/Users/me");

  channel.poll();

  setInterval(() => {
    client.request("/APP/Alerts/addAllAsFriends").catch(console.error);
  }, 10000);

  function initPlurkClient() {
    return new PlurkClient({
      consumerKey: config.consumerKey,
      consumerSecret: config.consumerSecret,
      token: config.token,
      tokenSecret: config.tokenSecret,
    });
  }

  function initMatchingQueue() {
    const queue = new MatchingQueue({
      canMatch(plurk1, plurk2) {
        return plurk1.user_id !== plurk2.user_id;
      },
    });
    queue.on("match", handleMatch);
    queue.on("error", console.error);
    return queue;
  }

  async function initPlurkChannel(client) {
    const result = await client.request("/APP/Realtime/getUserChannel");
    const channel = new PlurkChannel(result.comet_server, result.channel_name);
    channel.on("plurk", handleNewPlurk);
    channel.on("response", handleNewResponse);
    channel.on("error", console.error);
    return channel;
  }

  async function handleNewPlurk(plurk) {
    if (!isMatchRequest(plurk)) {
      return;
    }

    if (queue.some((item) => item.user_id === plurk.user_id)) {
      await client.request("/APP/Responses/responseAdd", {
        plurk_id: plurk.plurk_id,
        qualifier: ":",
        content: "你已經在配對中囉，請稍候 [error]",
      });
      return;
    }

    queue.push(plurk);
    await client.request("/APP/Responses/responseAdd", {
      plurk_id: plurk.plurk_id,
      qualifier: ":",
      content: "配對中 [loading] \n回覆 取消 可以取消這次配對喔！",
    });
  }

  async function handleNewResponse(data) {
    const { plurk, response } = data;
    if (isMatchRequest(plurk) && response.user_id === plurk.user_id) {
      return handleMatchResponse(data);
    }
    if (isChat(plurk) && response.user_id !== botData.id) {
      return handleChatResponse(data);
    }
  }

  function isMatchRequest(plurk) {
    return (
      plurk.user_id !== botData.id &&
      plurk.limited_to === `|${botData.id}||${plurk.user_id}|`
    );
  }

  function isChat(plurk) {
    return plurk.user_id === botData.id && plurk.limited_to != null;
  }

  async function handleMatchResponse(data) {
    const { plurk, response } = data;
    const command = response.content_raw.trim();
    if (command === "取消") {
      queue.removeWhere((item) => item.plurk_id === plurk.plurk_id);
      await client.request("/APP/Responses/responseAdd", {
        plurk_id: plurk.plurk_id,
        qualifier: ":",
        content: "幫你取消這次配對了 [error]",
      });
    }
  }

  async function handleChatResponse(data) {
    const { plurk, response } = data;
    const user = data.user[response.user_id.toString()];
    const command = response.content_raw.trim();
    if (command === "掰掰") {
      const limitedTo = parseLimitedTo(plurk.limited_to);
      const newLimitedTo = limitedTo.filter((id) => id !== response.user_id);
      await client.request("/APP/Timeline/plurkEdit", {
        plurk_id: plurk.plurk_id,
        limited_to: JSON.stringify(newLimitedTo),
      });
      await client.request("/APP/Responses/responseAdd", {
        plurk_id: plurk.plurk_id,
        qualifier: ":",
        content: `@${user.nick_name} 離開了這個對話`,
      });
      if (newLimitedTo.length === 1) {
        await client.request("/APP/Timeline/plurkDelete", {
          plurk_id: plurk.plurk_id,
        });
      }
    }
  }

  async function handleMatch(plurk1, plurk2) {
    const profile1 = await client.request("/APP/Profile/getPublicProfile", {
      user_id: plurk1.user_id,
      include_plurks: false,
    });
    const profile2 = await client.request("/APP/Profile/getPublicProfile", {
      user_id: plurk2.user_id,
      include_plurks: false,
    });
    const MAX_CONTENT_LENGTH = 120;
    const content1 = truncate(plurk1.content_raw, MAX_CONTENT_LENGTH);
    const content2 = truncate(plurk2.content_raw, MAX_CONTENT_LENGTH);
    const newPlurk = await client.request("/APP/Timeline/plurkAdd", {
      qualifier: ":",
      content:
        "配對成功 [ok]\n\n" +
        `@${profile1.user_info.nick_name}: ${content1}\n\n` +
        `@${profile2.user_info.nick_name}: ${content2}`,
      limited_to: JSON.stringify([plurk1.user_id, plurk2.user_id]),
    });
    const newPlurkUrl = plurkUrl(newPlurk.plurk_id);
    await client.request("/APP/Responses/responseAdd", {
      plurk_id: plurk1.plurk_id,
      qualifier: ":",
      content: "配對成功 [ok]\n" + newPlurkUrl,
    });
    await client.request("/APP/Responses/responseAdd", {
      plurk_id: plurk2.plurk_id,
      qualifier: ":",
      content: "配對成功 [ok]\n" + newPlurkUrl,
    });
  }

  function parseLimitedTo(text) {
    if (text == null) {
      return null;
    }
    const result = [];
    const pattern = /\|([^|]*)\|/y;
    let match = null;
    while ((match = pattern.exec(text)) !== null) {
      const id = parseInt(match[1]);
      result.push(id);
    }
    return result;
  }

  function truncate(text, length) {
    if (text.length <= length) {
      return text;
    } else {
      return length === 0 ? "" : text.slice(0, length - 1) + "…";
    }
  }

  function plurkUrl(plurk_id) {
    return `https://www.plurk.com/p/${plurk_id.toString(36)}`;
  }
}

main().catch(console.error);
