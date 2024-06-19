# Lambda Authentication Proxy

Lambda Authentication Proxy is brought to you by your friends at [Last Call Media](https://www.lastcallmedia.com), this nodejs library provides a simple authentication proxy. There are different configurable authentication providers included.

## Basic Setup

A typical setup is to use an AWS Lambda handler triggered by a CloudFront Distribution behavior.

### Lambda Handler

The Lambda handler extracts the request, runs it through the desired proxy and either returns a response that triggers the authentication process, or passes the request through to the original destination if the user is authenticated.

A basic template for the lambda handler looks something like this:

```javascript
//const Proxy = require('@lastcall/lambda-auth-proxy').Local;
//const Authorizer = Proxy.authorizer;

const Proxy = require('@lastcall/lambda-auth-proxy').OAuth2;
const Authorizer = Proxy.authorizers.Github;

let proxy;

exports.handler = async (event, context, callback) => {
    const request = event.Records[0].cf.request;

    if(!proxy) {
    	const authorizerConfig = {
        	required: {},
            optional: {}
        }
        const proxyConfig = {
        	// Proxy config here.
        }
        const name = context.functionName.split('.').pop();
        console.log('Instantiating authorizer for ' + name)

        const authorizer = new Authorizer(authorizerConfig.required, authorizerConfig.optional);


        proxy = new Proxy(authorizer, proxyConfig);
    }

    return proxy.handleRequest(request);
}

```

### CloudFront Distribution behavior

The Lambda above gets triggered by an AWS CloudFront distribution behavior.

* Create a CloudFront distribution that traffic to your site or application passes through.
* In the `Lambda Function Associations` section at the bottom of the page add a new CloudFront Event that triggers the lambda on the `Viewer Request` event.
* Add the Lambda ARN identifier. This can be found in the top right corner of the Lambda function. You can not use the `$LATEST` version alias, so you must use a published version of the Lambda function as a part of the identifier.


**NOTE:** If using the `Local` proxy be sure to read the documentation for that configuration, because there are some additional options that must be set for the the Cloudfront Distribution.


## Individual Proxy Configuration

Documentation for the different proxy types provided in this package.

### Local

The `Local` proxy uses cookie-based authentication. An HTML form is used to `POST` a request to the proxy where a username/password can be validated. If the credentials match the configured ones a cookie is set and the user gains access. Otherwise their access is denied.

#### LocalAuthorizer Configuration Options:
* `cookieName`: The name of the cookie that is stored when a user enters valid credentials.
  * Default: `_logged_in`
* `username`: The username that grants authentication.
  * Default: `ABC`
* `password`: The password that grants authentication.
  * Default: `123`

#### Local Proxy Configuration Options:
* `pathLogin`: The path that the user is redirected to where they are presented with the login form.
  * Default: `/auth/login`
* `siteName`: The name of the site the proxy is sitting in front of. Will appear on the login form.
  * Default: `Restricted Site`
* `baseUrl`: The base url for the site requiring authorization.
  * Default: `null` (the proxy will attempt to determine the base url automatically.)

#### Example Local Auth Lambda Handler:

```javascript
const Proxy = require('@lastcall/lambda-auth-proxy').Local;
const Authorizer = Proxy.authorizer;

let proxy;

exports.handler = async (event, context, callback) => {
    const request = event.Records[0].cf.request;

    if(!proxy) {
        const name = context.functionName.split('.').pop();
        console.log('Instantiating authorizer for ' + name)

        const authorizer = new Authorizer({
            cookieName: 'mysite_user_is_logged_in',
            username: 'foo',
            password: 'B4R'
        });
        proxy = new Proxy(authorizer, {
            siteName: 'My Private Website',
        });
    }

    return proxy.handleRequest(request);
}
```

#### Special Cloudfront Distribution Configuration

This proxy requires two additional options to be specified in the distribution:
* Allowed HTTP Methods: **MUST** be set to `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`, because the form submits a post request
* The Lambda behavior **MUST** have the `include body` option checked, because information is passed in the POST request body.

## Oauth2

Oauth2 proxy configuration. In the future more Oauth2 identity providers may be added. For now there is only GitHub.

### GitHub

#### Create a GitHub Application

A GitHub application is required to use this proxy. This can be done at `https://github.com/settings/applications/new`. The only configuration that is important here is that the `Authorization Callback URL` is configured to use the same URL as the `pathCallback` option for the Oauth2 Proxy.

You will need the `Client ID` and `Client Secret` codes provided by GitHub once the application is created.

#### GitHub Authorizer Configuration Parameters:
* `clientId`: Client ID from GitHub application.
* `clientSecret`: Client Secret from GitHub application.
* `opts`: Optional, preconfigured with default configuration for GitHub Oauth2 authentication. Changeable  options are: `baseSite`, `authorizePath`, `accessTokenPath`, and `baseAPI`

#### GitHub Proxy Configuration Options:
* **REQUIRED** `hashKey`: A unique string used for generating a hash.
* `baseUrl`: The base url for the site that requires authentication
  * Default: `false` - If not provided the proxy will attempt to determine the base url itself.
* `authCookieName`: The name of the cookie used to indicate that the user is authenticated.
  * Default: `_auth`
* `pathLogin`: The path that an unauthenticated user is redirected to that initiates authentication for logged out users.
  * Default: `/auth/login`
* `pathCallback`: The callback path that Oauth2 authentication is performed at.
  * Default: `/auth/callback`
* `pathLogout`: The path a user can visit to log out
  * Default: `/auth/logout`
* `logger`: An object used for logging.
  * Default: `console`

#### Additional Restrictions
Access can be limited based on GitHub account requirements by the GitHub Authorizer. In order to do this instantiate a new `Authorizer` and then add call the methods outlined below to add additional requirements besides a valid GitHub account

##### Email Address Domain

Allows the multiple email domains that are allowed access the content behind the proxy. If multiple addresses are configured, the user only needs one to gain access. The authorizer checks _all_ email addresses associated with the user's GitHub account, not just the primary.

**Example Usage**
```javascript
// Only allow users with gmail or hotmail email addresses.
const authorizer = new Authorizer(clientId, clientSecret {});
authorizer.requireEmailDomain('gmail.com');
authorizer.requireEmailDomain('hotmail.com');
```

##### GitHub Organization
Allows multiple organizations that are allowed to access the content behind the proxy. If multiple organizations are configured, the user only needs one to gain access.

**Example Usage**
```javascript
// Only allow users who belong to the LastCallMedia organization.
const authorizer = new Authorizer(clientId, clientSecret {});
authorizer.requireOrganizationMembership('LastCallMedia');
```

#### Example GitHub Oauth2 Lambda Handler

```javascript

const Proxy = require('@lastcall/lambda-auth-proxy').OAuth2;
const Authorizer = Proxy.authorizers.Github;

let proxy;

exports.handler = async (event, context, callback) => {
    const request = event.Records[0].cf.request;

    if(!proxy) {
        const name = context.functionName.split('.').pop();
        
        const clientId = 'GITHUB_APP_CLIENT_ID_HERE'
        const clientSecret = 'GITHUB_APP_CLIENT_SECRET'
        const hashKey = 'some_secret_hash_k3y'
        
        console.log('Instantiating authorizer for ' + name)

        const authorizer = new Authorizer(clientId, clientSecret {});
        
        // Require that users are members of the LastCallMedia Github
        // organization AND have a lastcallmedia.com email address
        authorizer.requireOrganizationMembership('LastCallMedia');
        authorizer.requireEmailDomain('lastcallmedia.com')

        proxy = new Proxy(authorizer, {
            hashKey: hashKey,
        });
    }

    return proxy.handleRequest(request);
}


```


