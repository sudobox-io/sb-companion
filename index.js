const Docker = require("dockerode");
const DockerEE = require("docker-event-emitter");
const axios = require("axios");
const publicIp = require("public-ip");

const mongoose = require("mongoose");
const Settings = require("./models/Settings");

// Mongoose connection
mongoose
  .connect(`${process.env.MONGO_URL_STRING}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Successfully connected to DB"))
  .catch((err) => console.log(err));

require("dotenv").config();

const checkIfARecordExists = async (key, settings) => {
  let exists = false;

  const existingRecords = await axios({
    method: "GET",
    url: `https://api.cloudflare.com/client/v4/zones/${settings.zoneId}/dns_records?name=${key}.${settings.domain.valye}`,
    headers: {
      "X-Auth-Email": settings.email,
      "X-Auth-Key": settings.api,
      "Content-Type": "application/json",
    },
  });

  if (existingRecords.data.result.length >= 1) exists = true;

  return exists;
};

const addDefaultARecords = async (settings) => {
  ["auth", "traefik", "ldapadmin"].forEach(async (record) => {
    try {
      await axios({
        method: "POST",
        url: `https://api.cloudflare.com/client/v4/zones/${settings.zoneId}/dns_records`,
        data: {
          type: "A",
          name: record,
          content: await publicIp.v4(),
          ttl: 1,
          proxied: false,
        },
        headers: {
          "X-Auth-Email": settings.email,
          "X-Auth-Key": settings.api,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      console.log(e);
    }
  });
};

(async () => {
  try {
    const docker = new Docker({
      socketPath: "/var/run/docker.sock",
    });

    const events = new DockerEE(docker);

    const cloudFlareApi = await Settings.findOne({ name: "cloudflare_global_api" });
    const cloudFlareZoneId = await Settings.findOne({ name: "cloudflare_zone_id" });
    const cloudFlareEmail = await Settings.findOne({ name: "cloudflare_email" });
    const domain = await Settings.findOne({ name: "domain" });

    const settings = {
      api: cloudFlareApi.value,
      zoneId: cloudFlareZoneId.value,
      email: cloudFlareEmail.value,
      domain,
    };

    await addDefaultARecords(settings);

    events.on("container.create", async (ev) => {
      const attributeKeys = Object.keys(ev.Actor.Attributes);

      attributeKeys.forEach(async (key) => {
        console.log(key);
        if (key.startsWith("sb-companion.enabled")) {
          if (ev.Actor.Attributes["sb-companion.enabled"] === "true") {
            const subdomain = ev.Actor.Attributes["sb-companion.domain"].split(".")[0];

            const recordExists = await checkIfARecordExists(subdomain, settings);

            if (!recordExists) {
              try {
                await axios({
                  method: "POST",
                  url: `https://api.cloudflare.com/client/v4/zones/${settings.zoneId}/dns_records`,
                  data: {
                    type: "A",
                    name: subdomain,
                    content: await publicIp.v4(),
                    ttl: 1,
                    proxied: false,
                  },
                  headers: {
                    "X-Auth-Email": settings.email,
                    "X-Auth-Key": settings.api,
                    "Content-Type": "application/json",
                  },
                });
              } catch (e) {
                console.log(e);
              }
            }
          }
        }
      });
    });

    await events.start();
  } catch (err) {
    console.log(err);
  }
})();
