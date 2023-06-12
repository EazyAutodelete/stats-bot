const { MongoClient, ObjectId } = require("mongodb");
const { Client } = require("discord.js");

const config = require("./config/config.json");

const bot = new Client({ intents: 1 });
const mongo = new MongoClient(
  `mongodb://${config.db.user}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${
    config.db.name
  }`
);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

var guildCount,
  userCount,
  deletedMessagesDay,
  deletedMessagesWeek,
  deletedMessagesMonth,
  deletedMessagesYear = 0;

const second = 1000;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = day * 30;
const year = day * 365;

bot.once("ready", () => {
  console.log("Bot is ready");

  setInterval(writeStats, 1_000 * 60 * 10);
});

bot.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "stats")
    return await interaction.reply({
      embeds: [
        {
          title: "Stats",
          description: `**Guilds:** ${guildCount}\n**Users:** ${userCount}\n\n**Messages deleted in the last:**\n**Day:** ${deletedMessagesDay}\n**Week:** ${deletedMessagesWeek}\n**Month:** ${deletedMessagesMonth}\n**Year:** ${deletedMessagesYear}`,
        },
      ],
      ephemeral: true,
    });
});

(async () => {
  await mongo.connect();

  collectStats();

  bot.login(config.token);
})();

async function writeStats() {
  const statsChannel = await bot.channels.fetch(config.statsChannel);
  await statsChannel.setName(
    config.statsText.replace("{val}", formatNumber(guildCount)).replace("{val}", formatNumber(userCount))
  );

  const messagesFirstChannel = await bot.channels.fetch(config.messagesChannelFirst);
  await messagesFirstChannel.setName(
    config.messagesTextFirst.replace("{val}", deletedMessagesDay).replace("{val}", deletedMessagesWeek)
  );

  const messagesSecondChannel = await bot.channels.fetch(config.messagesChannelSecond);
  await messagesSecondChannel.setName(
    config.messagesTextSecond.replace("{val}", deletedMessagesMonth).replace("{val}", deletedMessagesYear)
  );
}

async function collectStats() {
  const collection = mongo.db("eazyautodelete").collection("stats");

  guildCount = formatNumber(
    (
      await Promise.all(
        config.clusters.map(async cluster => {
          const data = await collection.findOne({ cluster: cluster }, { sort: { $natural: -1 }, limit: 1 });

          return data && data.guilds ? data.guilds : 0;
        })
      )
    ).reduce((a, b) => a + b, 0)
  );

  userCount = formatNumber(
    (
      await Promise.all(
        config.clusters.map(async cluster => {
          const data = await collection.findOne({ cluster: cluster }, { sort: { $natural: -1 }, limit: 1 });

          return data && data.users ? data.users : 0;
        })
      )
    ).reduce((a, b) => a + b, 0)
  );

  deletedMessagesDay = formatNumber(await getDeletedMessages(collection, day));
  deletedMessagesWeek = formatNumber(await getDeletedMessages(collection, week));
  deletedMessagesMonth = formatNumber(await getDeletedMessages(collection, month));
  deletedMessagesYear = formatNumber(await getDeletedMessages(collection, year));
}

const objectIdFromDate = function (date) {
  return new ObjectId(Math.floor(date.getTime() / 1_000).toString(16) + "0000000000000000");
};

const getDeletedMessages = async function (collection, durationInMs) {
  return (
    await collection.find({ _id: { $gte: objectIdFromDate(new Date(new Date().getTime() - durationInMs)) } }).toArray()
  ).reduce((a, b) => a + b.deletedMessages, 0);
};

const formatNumber = function (number) {
  return number < 10_000
    ? `${(number / 1_000).toFixed(2)}k`
    : number < 100_000
    ? `${(number / 1_000).toFixed(1)}k`
    : number < 1_000_000
    ? `${Math.round(number / 1_000)}k`
    : `${(number / 1_000_000).toFixed(2)}m`;
};