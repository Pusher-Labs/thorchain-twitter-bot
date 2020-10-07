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

    /**
   * Fetch network data from midgard
   */
  const baseUrl = await midgard();
  const req = await fetch(`${baseUrl}/v1/network`);
  const json = await req.json();

  if (json && json.bondingROI && json.stakingROI && json.activeNodeCount && json.totalStaked && json.totalReserve) {

    const bondingROI = ((+json.bondingROI) * 100).toFixed(2);
    const stakingROI = ((+json.stakingROI) * 100).toFixed(2);
    const activeNodeCount = json.activeNodeCount;
    const totalStaked = ((+json.totalStaked) / 10 ** 8).toFixed(0);
    const totalReserve = ((+json.totalReserve) / 10 ** 8).toFixed(0);

    const message = `#THORChain Network Snapshot:
Node Count: ${activeNodeCount}
Pooled Capital: ${formatNumber(totalStaked)}
Reserve: ${formatNumber(totalReserve)}
Node APY: ${bondingROI}%
Pool APY: ${stakingROI}%`;

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

}

function formatNumber(num) {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}
