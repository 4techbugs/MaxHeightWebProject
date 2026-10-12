import sql from "mssql";

const config = {
  server: process.env.DB_SERVER || "localhost",
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME || "MaxHeightElectricityBill",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise;

export function getDbPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

export { sql };
