const { createClient } = require("redis");

const pubClient = createClient({
    url: "redis://localhost:6379"
});

const subClient = pubClient.duplicate();

pubClient.on("error", (err) => {
    console.error("Redis Pub Error:", err);
});

subClient.on("error", (err) => {
    console.error("Redis Sub Error:", err);
});

(async () => {
    await pubClient.connect();
    await subClient.connect();
    console.log("Redis connected successfully");
})();

module.exports = { pubClient, subClient };