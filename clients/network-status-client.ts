import { DynamoDB } from 'aws-sdk';

export class NetworkStatusClient {

    docClient: DynamoDB.DocumentClient;
    table: string;

    constructor() {
        this.docClient = new DynamoDB.DocumentClient();
        this.table = process.env.NETWORK_SUMMARY_TABLE;
    }

    async update(data: {status: string, rate: string}) {

        const currentParams = {
            TableName: this.table,
            Key:{
                "key": "NETWORK_STATUS",
            },
            UpdateExpression: "set #v = :v",
            ExpressionAttributeValues:{
                ":v": data,
            },
            ExpressionAttributeNames: {
                "#v": "value",
            },
            ReturnValues:"UPDATED_NEW"
          };
    
          try {
            return await this.docClient.update(currentParams).promise();
          } catch (error) {
            console.error('error creating update: ', error);
          }

    }

    async fetchStatus() {
        const params = {
            TableName: this.table,
            Key:{
                "key": "NETWORK_STATUS",
            }
        };

        try {
            return await this.docClient.get(params).promise();   
        } catch (error) {
            console.error("Unable to read item. Error JSON:", JSON.stringify(error, null, 2));
            return;
        }

    }

}