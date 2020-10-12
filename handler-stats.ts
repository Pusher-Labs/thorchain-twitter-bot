import { APIGatewayProxyHandler } from "aws-lambda";
import * as fetch from "node-fetch";
import { format as formatDate } from "date-fns";
import * as commaNumber from "comma-number";
import { TwitterClient } from "./clients/twitter-client";
import { getRunePriceInUSD } from "./utils";

const makeStatsMessage = async () => {
  const response = await fetch(process.env.BEPSWAP_STATS_API);
  const json = await response.json();

  const priceInUSD = await getRunePriceInUSD();

  //Convert to USD
  [
    "totalDepth",
    "totalEarned",
    "totalStaked",
    "totalVolume",
    "totalVolume24hr",
  ].forEach((key) => {
    const current = json[key];
    if (current) {
      json[key] = ((priceInUSD * current) / 10 ** 8).toFixed(1);
    }
  });

  //Put commas
  Object.entries(json).forEach(([k, v]) => (json[k] = commaNumber(v)));

  const date = formatDate(new Date(), "PP");

  const msg = `#THORChain ${date} Summary:

RUNE Price: $${priceInUSD.toFixed(2)}

Users:
 Daily: ${json.dailyActiveUsers}
 Monthly: ${json.monthlyActiveUsers}
 Total: ${json.totalUsers}

Txs:
 Daily: ${json.dailyTx}
 Monthly: ${json.monthlyTx}
 Total: ${json.totalTx}

Volume:
 Last 24hr: $${json.totalVolume24hr}

Pools: 
  Count: ${json.poolCount}
  Total Earned: $${json.totalEarned}
`;
  return msg;
};

export const tweetStats: APIGatewayProxyHandler = async (_event, _context) => {
  const twitterClient = new TwitterClient();
  const message = await makeStatsMessage();
  return twitterClient.post(message);
};

// For debugging purpose
// export const debug: APIGatewayProxyHandler = async (_event, _context) => {
//   const message = await makeStatsMessage();
//   return {
//     statusCode: 200,
//     body: JSON.stringify(message, null, 2),
//   };
// };
