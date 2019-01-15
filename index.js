
const {Proxy, authorizers} = require('./lambdaoauth2');
const AWS = require('aws-sdk');

const ssm = new AWS.SSM();
let proxy;

module.exports.handler = async function(event, context) {
    const request = event.Records[0].cf.request;

    if(!proxy) {
        const name = context.functionName.split('.').pop();
        console.log('Instantiating authorizer for ' + name)
        const creds = await ssm.getParameter({
            Name: `/lambda/${name}/config`,
            WithDecryption: true
        }).promise()
            .then(p => JSON.parse(p.Parameter.Value))

        const authorizer = new authorizers.Github(creds.clientId, creds.clientSecret)
        proxy = new Proxy(authorizer, {
            hashKey: creds.hashKey
        })
    }

    return proxy.handleRequest(request);
}
