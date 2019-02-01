const fs = require('fs');
const {promisify} = require('util');
const querystring = require('querystring');
const Authorizer = require('./authorizers').LocalAuthorizer;
const readFile = promisify(fs.readFile);

class Proxy {

    constructor(authorizer, opts = {}) {
        this.authorizer = authorizer;
        this.pathLogin = opts.pathLogin || '/auth/login';
        this.siteName = opts.siteName || 'Restricted Site';
        this.baseUrl = opts.baseUrl || null;
    }

    handleRequest(request) {
        if (this.authorizer.accessGranted(request)) {
            return this.handleAccessGranted(request);
        }
        if (request.uri === this.pathLogin) {
            return this.handleLogin(request);
        }

        return this.handleLoginRequired(request);
    }

    /**
     * The user has access so pass the request through.
     */
    handleAccessGranted(request) {
        return Promise.resolve(request);
    }

    /**
     * Redirect the user to the login form.
     */
    handleLoginRequired(request) {
        const baseUrl = this.getBaseUrl(request);
        const loginUrl = baseUrl + this.pathLogin;
        const destination = encodeURIComponent(baseUrl + request.uri);

        const response = {
            status: '302',
            statusDescription: 'Login',
            body: 'Login',
            headers: {
                location: [{key: 'Location', value: loginUrl + '?destination=' + destination}],
            }

        };
        return Promise.resolve(response)
    }

    /**
     * Login process.
     *
     * If the request is post, then check credentials and pass the user through
     * if the credentials are correct, otherwise reload the login form.
     */
    async handleLogin(request) {
        let messages = '';
        if (request.method.toLowerCase() === 'post') {
            const body = Buffer.from(request.body.data, 'base64').toString();
            // Use when testing locally...
            // const body = request.body.data;

            const params = querystring.parse(body);
            const enteredUsername = params.username;
            const enteredPassword = params.password;
            if (this.authorizer.checkCredentials(enteredUsername, enteredPassword)) {
                const response = {
                    status: '302',
                    statusDescription: 'Access Granted',
                    body: 'Access Granted',
                    headers: {
                        "set-cookie": this.authorizer.getAuthCookie(),
                        location: [{key: 'Location', value: this.getDestinationFromQueryString(request)}],
                    }
                };
                return Promise.resolve(response)
            }
            messages = `<div class="alert alert-danger" role="alert">Error: Invalid username/password combination.</div>`;
        }

        const contents = await readFile(__dirname + '/html/login.html', 'utf-8')
            .then((content) => {
               return content
                   .replace('{{messages}}', messages)
                   .replace('{{sitename}}', this.siteName)
                   .replace('{{siteurl}}', this.getBaseUrl(request))
            });

        const response = {
            status: '200',
            headers: {
                "Content-Type": [{key: "Content-Type", value: "text/html"}],
            },
            "body": contents,
            "isBase64Encoded": false
        };

        return Promise.resolve(response);
    }

    getDestinationFromQueryString(request) {
        const requestQueryString = request.querystring ? request.querystring : '';
        const params = querystring.parse(requestQueryString);
        return params.destination ? params.destination : '';
    }

    getBaseUrl(request) {
        if(this.baseUrl) {
            return this.baseUrl
        }
        if(request.headers.hasOwnProperty('host')) {
            return `https://${request.headers.host[0].value}`
        }
        throw new Error('Unable to determine host.')
    }

}

module.exports = Proxy;
module.exports.authorizer = Authorizer;