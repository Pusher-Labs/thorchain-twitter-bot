import * as fetch from "node-fetch";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=thorchain&vs_currencies=usd";
export const getRunePriceInUSD = async (): number => {
  const res = await fetch(COINGECKO_URL);
  const json = await res.json();
  return json.thorchain.usd;
};
