import { APIGatewayProxyHandler } from 'aws-lambda';
import midgard from '@thorchain/asgardex-midgard';
import 'source-map-support/register';
import * as fetch from 'node-fetch';
import { NetworkStatusClient } from './clients/network-status-client';
import { TwitterClient } from './clients/twitter-client';

/**
 * axois doesn't play nice with webpack
 * https://stackoverflow.com/questions/52891992/referenceerror-xmlhttprequest-is-not-defined-when-running-my-angular-6-univers
 */
(global as any).XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

export enum NetworkSecurityStatus {
  INEFFICIENT = 'Inefficient',
  OVERBONDED = 'Overbonded',
  OPTIMAL = 'Optimal',
  UNDERBONDED = 'Underbonded',
  INSECURE = 'Insecure',
  DOWN = 'Down'
}

export const statusCheck: APIGatewayProxyHandler = async (_event, _context) => {

  const networkStatusClient = new NetworkStatusClient();
  const twitterClient = new TwitterClient();
  let status;
  let security;

  /**
   * Fetch network data from midgard
   */
  const baseUrl = await midgard();
  const req = await fetch(`${baseUrl}/v1/network`);
  const json = await req.json();

  /**
   * Network is up. Set security status
   */
  if (json.activeNodeCount > 0) {

    const activeBond = +json.bondMetrics.totalActiveBond;
    security = activeBond / (activeBond + Number(json.totalStaked));

    if (0.9 <= security) {
      status = NetworkSecurityStatus.INEFFICIENT;
    } else if (0.75 < security && security < 0.9) {
      status = NetworkSecurityStatus.OVERBONDED;
    } else if (0.60 <= security && security <= 0.75) {
      status = NetworkSecurityStatus.OPTIMAL;
    } else if (0.50 <= security && security < 0.60) {
      status = NetworkSecurityStatus.UNDERBONDED;
    } else if (security < 0.50) {
      status = NetworkSecurityStatus.INSECURE;
    }

  /**
   * All Nodes are down
   */
  } else {

    status = NetworkSecurityStatus.DOWN;
    security = 0;

  }

  /**
   * Fetch existing status from the DB
   */
  let data = await networkStatusClient.fetchStatus();

  if (!data) {

    console.error('something went wrong');
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'No data obj returned. When trying to fetch the status, an error occurred.',
      }, null, 2),
    };

  } else {

    /**
     * No NETWORK_STATUS found in the db
     */
    if (!data.Item) {
      const update = await networkStatusClient.update({rate: security, status: status});

      if (!update) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: 'No status found. When trying to update, an error occurred.',
          }, null, 2),
        };
      } else {

        /**
         * Since db was previously empty, tweet the initial status.
         */

          const message = twitterClient.createStatusMessage(status);

          const tweet = await twitterClient.post(message);
          if (tweet) {
            console.log('tweet successful: ', tweet);
            return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Tweet successful',
              input: status,
            }, null, 2),
          };
          }

      }


    /**
     * NETWORK_STATUS returned.
     */
    } else {

      const networkStatus = data.Item;

      /**
       * Status is different. Tweet Status
       */
      if (networkStatus.value.status !== status) {

        const message = twitterClient.createStatusMessage(status);

        const tweet = await twitterClient.post(message);
        if (tweet && tweet.data) {
          console.log(`tweeted: ${tweet.data.text}`);
        } else {
          console.error('tweet unsuccessful');
        }


      }

      /**
       * Update Status
       */
      const update = await networkStatusClient.update({rate: security, status: status});

      if (!update) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: 'No status found. When trying to update, an error occurred.',
          }, null, 2),
        };
      }
    }
  }


  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '👍 cron run',
      input: status,
    }, null, 2),
  };
}

export const networkSnapshot: APIGatewayProxyHandler = async (_event, _context) => {

  const twitterClient = new TwitterClient();
  let priceRes;

  try {
    priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=thorchain&vs_currencies=usd"); 
  } catch (error) {
    console.error('error fetching current price of RUNE');
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'error fetching price of rune',
      }, null, 2),
    };
  }

  if (priceRes) {

    const priceJson = await priceRes.json();

    if (priceJson && (priceJson.thorchain && priceJson.thorchain.usd)) {

      const currentPrice = priceJson.thorchain.usd;

        // const baseUrl = await midgard();

          /**
         * Fetch network data from midgard
         */
        

        /** Temporarily until midgard update */
        let baseUrl;
        const ipsQuery = await fetch(`https://chaosnet-seed.thorchain.info`);
        const ipsJson = await ipsQuery.json();

        if (ipsJson && ipsJson.length > 0) {

          const ip = ipsJson[Math.floor(Math.random() * ipsJson.length)];
          baseUrl = `http://${ip}:8080`;

        }

        /** end */
        
        if (baseUrl) {

          const req = await fetch(`${baseUrl}/v1/network`);
          const json = await req.json();
        
          if (json && json.bondingROI && json.stakingROI && json.activeNodeCount && json.totalStaked && json.totalReserve) {
        
            const bondingROI = ((+json.bondingROI) * 100).toFixed(2);
            const stakingROI = ((+json.stakingROI) * 100).toFixed(2);
            const activeNodeCount = json.activeNodeCount;
            const totalPooled = ( ((+json.totalStaked) / 10 ** 8) * 2 );
            const totalReserve = ((+json.totalReserve) / 10 ** 8);

            const totalPooledUsd = (totalPooled * currentPrice).toFixed(0);
            const totalReserveUsd = (totalReserve * currentPrice).toFixed(0);

            const activeBonds = json.activeBonds.map( (bondStr) => formatAssetUnits( Number(bondStr), 8 ));
            const standbyBonds = json.standbyBonds.map( (bondStr) => formatAssetUnits( Number(bondStr), 8 ) );
            const totalBonded = calculateTotalBonded(activeBonds, standbyBonds);

            const totalBondedUsd = (totalBonded * currentPrice).toFixed(0);
            const totalCapitalUsd = ((totalPooled + totalBonded + totalReserve) * currentPrice).toFixed(0);

            let security;
            let status: NetworkSecurityStatus;
        
            /**
             * Network is up. Set security status
             */
            if (json.activeNodeCount > 0) {
        
              const activeBond = +json.bondMetrics.totalActiveBond;
              security = activeBond / (activeBond + Number(json.totalStaked));
        
              if (0.9 <= security) {
                status = NetworkSecurityStatus.INEFFICIENT;
              } else if (0.75 < security && security < 0.9) {
                status = NetworkSecurityStatus.OVERBONDED;
              } else if (0.60 <= security && security <= 0.75) {
                status = NetworkSecurityStatus.OPTIMAL;
              } else if (0.50 <= security && security < 0.60) {
                status = NetworkSecurityStatus.UNDERBONDED;
              } else if (security < 0.50) {
                status = NetworkSecurityStatus.INSECURE;
              }
        
            /**
             * All Nodes are down
             */
            } else {
        
              status = NetworkSecurityStatus.DOWN;
              security = 0;
        
            }
        
            const statusMessage = twitterClient.createStatusMessage(status);

            const message = `#THORChain #Chaosnet Network Snapshot:

Node Count: ${activeNodeCount}
Pooled Capital: $${formatNumber(totalPooledUsd)}
Reserve Capital: $${formatNumber(totalReserveUsd)}
Nodes Capital: $${formatNumber(totalBondedUsd)}
Total Capital: $${formatNumber(totalCapitalUsd)}
Node APY: ${bondingROI}%
Pool APY: ${stakingROI}%
Security Status: ${statusMessage}`;
        
            const tweet = await twitterClient.post(message);
            if (tweet && tweet.data) {
              console.log(`tweeted: ${tweet.data.text}`);
            } else {
              console.error('tweet unsuccessful');
            }
        
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: '👍 network snapshot cron run',
              }, null, 2),
            };
          } else {
            console.log('uh oh...');
          }

        } else {
          console.error('NO BASE URL!');
        }


    }


  }

}

function formatNumber(num) {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

function formatAssetUnits(value: number, unit: number): number {
  return value / 10 ** unit;
}

function calculateTotalBonded(activeBonds: number[], standbyBonds: number[]): number {

  let total = 0;

  for (const bond of activeBonds) {
    total += bond;
  }

  for (const bond of standbyBonds) {
    total += bond;
  }

  return total;

}
