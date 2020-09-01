
// var Twit = require('twit');
import * as Twit from 'twit';
import { NetworkSecurityStatus } from '../handler';

export class TwitterClient {

    private _twit;
    
    constructor() {

        this._twit = new Twit({
            consumer_key:         process.env.TWITTER_API_KEY,
            consumer_secret:      process.env.TWITTER_API_SECRET,
            access_token:         process.env.TWITTER_ACCESS_TOKEN,
            access_token_secret:  process.env.TWITTER_ACCESS_TOKEN_SECRET,
            timeout_ms:           10*1000,  // optional HTTP request timeout to apply to all requests.
            strictSSL:            true,     // optional - requires SSL certificates to be valid.
        });

    }

    createStatusMessage(status: NetworkSecurityStatus): string {

        // let message;

        switch (status) {
            case NetworkSecurityStatus.INEFFICIENT:
                return '🛑 Inefficient (very overbonded)';

            case NetworkSecurityStatus.OVERBONDED:
                return '⚠️ Overbonded';

            case NetworkSecurityStatus.OPTIMAL:
                return '✅ Optimal';

            case NetworkSecurityStatus.UNDERBONDED:
                return '⚠️ Underbonded';

            case NetworkSecurityStatus.INSECURE:
                return '🛑 Insecure (very underbonded)';

            case NetworkSecurityStatus.DOWN:
                return '🛑 Down';
        }

        // if (message) {
        //     return `#THORChain Network Status: ${message}`
        // }

        // return;

    }

    async post(message: string) {

        try {
            return await this._twit.post('statuses/update', { 
                status: message
            });   
        } catch (error) {
            console.error('error posting tweet: ', error);
            return;
        }        

    }

}