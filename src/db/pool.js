const { Pool } = require("pg");
const camelcaseKeys = require("camelcase-keys");
const config = require("../config");

const pool = new Pool({
  host: config.db.host,
  user: config.db.user,
  password: String(config.db.password),
  database: config.db.database,
  port: config.db.port,
  max: 10,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 60000,
});

const wrap = (res) => {
  if (res?.rows) res.rows = camelcaseKeys(res.rows, { deep: true });
  return res;
};

const originQuery = pool.query.bind(pool);
pool.query = async (text, params, cb) => {
  if (typeof cb === "function") {
    return originQuery(text, params, (e, r) => cb(e, wrap(r)));
  }
  return wrap(await originQuery(text, params));
};

pool.on("connect", (client) => {
  if (client.query.__wrapped) return;
  const oq = client.query.bind(client);
  client.query = async (t, p, cb) => {
    if (typeof cb === "function") {
      return oq(t, p, (e, r) => cb(e, wrap(r)));
    }
    return wrap(await oq(t, p));
  };
  client.query.__wrapped = true;
});

module.exports = pool;
