const envVars = {
  DISCORD_TOKEN: Bun.env.TOKEN,
  NODE_ENV: Bun.env.NODE_ENV || "development",
};

const missingVars = Object.entries(envVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingVars.join(", ")}`);
}

interface Env {
  DISCORD_TOKEN: string;
  NODE_ENV: string;
}

const Config: Env = {
  DISCORD_TOKEN: envVars.DISCORD_TOKEN!,
  NODE_ENV: envVars.NODE_ENV!,
};

export default Config;
