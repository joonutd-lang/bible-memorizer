import {createClient} from "@vercel/kv";

const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

export const isKvConfigured = Boolean(kvUrl && kvToken);

export const kvClient = isKvConfigured
  ? createClient({
      url: kvUrl as string,
      token: kvToken as string,
    })
  : null;

