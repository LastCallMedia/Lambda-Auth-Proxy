
const {URLSearchParams} = require('url');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const Github = require('./authorizers').Github;

class Proxy {
    constructor(authorizer, opts = {}) {
        if(!opts.hashKey) throw new Error('opts.hashKey must be set when constructing proxy');

        this.baseUrl = opts.baseUrl || false;
        this.hashKey = opts.hashKey;
        this.authCookieName = opts.authCookieName || '_auth';
        this.pathLogin = opts.pathLogin || '/auth/login';
        this.pathCallback = opts.pathCallback || '/auth/callback';
        this.pathLogout = opts.pathLogout || '/auth/logout';
        this.logger = opts.logger || console;

        this.authorizer = authorizer
    }

    /**
     * Route a request to the proper method.
     *
     * @param request
     * @return {*}
     */
    handleRequest(request) {
        const currentUser = this.getCurrentUser(request);
        if(request.uri === this.pathLogin) {
            return this.handleLogin(request, currentUser);
        }
        if(request.uri === this.pathCallback) {
            return this.handleCallback(request, currentUser);
        }
        if(request.uri === this.pathLogout) {
            return this.handleLogout(request, currentUser);
        }
        return this.handleRestricted(request, currentUser);
    }

    /**
     * Handle the user visiting the login page.
     *
     * @param request
     * @param currentUser
     * @return {*}
     */
    handleLogin(request, currentUser) {
        const qs = new URLSearchParams(request.querystring);
        const next = this.filterDestination(qs.get('destination'));
        if(currentUser) return this.sendTo(next, request, currentUser);

        const authorizeURL = this.authorizer.getAuthorizeUrl({
            redirect_uri: `${this.getBaseUrl(request)}${this.pathCallback}`,
            state: next
        });
        const response = {
            status: '302',
            statusDescription: 'Login',
            body: 'Login',
            headers: {
                location: [{key: 'Location', value: authorizeURL}],
            }
        }
        return Promise.resolve(response)
    }

    /**
     * Handle the user visiting callback page.
     *
     * @param request
     * @param currentUser
     * @return {Promise<Response>}
     */
    async handleCallback(request, currentUser) {
        const qs = new URLSearchParams(request.querystring);
        const state = qs.get('state');
        const next = this.filterDestination(state);

        try {
            const account = await this.authenticate(request, qs.get('code'), state).then(code => this.authorizer.authorize(code))
            const token = jwt.sign(account, this.hashKey, {expiresIn: '12h', noTimestamp: true});

            return this.sendTo(next, request, currentUser, {
                "set-cookie": [{key: 'Set-Cookie', value: cookie.serialize(this.authCookieName, token, {httpOnly: true, secure: true, path:  '/'})}]
            })
        }
        catch(err) {
            this.logger.error('Error handling authentication:', err)
            return Promise.resolve({
                status: '403',
                statusDescription: 'Access denied',
                body: 'Access Denied'
            })
        }
    }

    /**
     * Handle the user visiting the logout page.
     *
     * @param request
     * @param currentUser
     * @return {Promise<Response>}
     */
    handleLogout(request, currentUser) {
        const qs = new URLSearchParams(request.querystring);
        const next = this.filterDestination(qs.get('destination'));
        return this.sendTo(next, request, currentUser, {
            "set-cookie": [{key: 'Set-Cookie', value: cookie.serialize(this.authCookieName, '', {httpOnly: true, secure: true, path: '/'})}]
        })
    }

    /**
     * Handle the user visiting any page that should be restricted.
     *
     * @param request
     * @param currentUser
     * @return {*}
     */
    handleRestricted(request, currentUser) {
        if(currentUser) {
            return Promise.resolve(request);
        }
        const qs = new URLSearchParams({
            destination: `${request.uri}${request.querystring ? `?${request.querystring}` : ''}`
        })
        return Promise.resolve({
            status: '302',
            statusDescription: 'Login Required',
            headers: {
                location: [{key: 'Location', value: `${this.pathLogin}?${qs.toString()}`}]
            },
            body: 'Unauthorized',
        })
    }

    /**
     * Send a user to a predefined destination, optionally specifying response headers.
     *
     * @param destination
     * @param request
     * @param currentUser
     * @param headers
     * @return {Promise<{status: string, headers: *}>}
     */
    sendTo(destination, request, currentUser, headers = {}) {
        return Promise.resolve({
            status: '302',
            headers: Object.assign({}, headers, {
                location: [{key: 'Location', value: destination}]
            })
        })
    }

    /**
     * Retrieves whatever data is stored about the current user.
     *
     * @param request
     * @return {*}
     */
    getCurrentUser(request) {
        const headers = request.headers;
        const parsedCookies = parseCookies(headers);
        const authToken = parsedCookies[this.authCookieName];
        if(authToken) {
            try {
                return jwt.verify(authToken, this.hashKey);
            }
            catch(err) {
                this.logger.warn('Token validation failed: ',  err)
                // No-op
            }
        }
        return false;
    }

    /**
     * Attempt to obtain an OAuth2 Bearer token for a code.
     *
     * @param code
     * @param state
     * @return {Promise<string>}
     */
    authenticate(request, code, state) {
        return new Promise((resolve, reject) => {
            this.authorizer.getOAuthAccessToken(
                code,
                {redirect_uri: `${this.getBaseUrl(request)}${this.pathCallback}`, state: state},
                function(err, access_token, refresh_token, results) {
                    if(err) return reject(err)
                    if(!access_token) return reject(results)
                    resolve(access_token);
                }
            )
        })
    }

    /**
     * Ensure the user is authorized for access.
     *
     * @param token
     * @return {{bearer: *}}
     */
    async authorize(token) {
        await this.authorizer.checkAuthorization(token)
        return {bearer: token}
    }

    /**
     * Check a redirect destination to see if it should be allowed.
     *
     * @param destination
     * @return {*|string}
     */
    filterDestination(destination) {
        // @todo: Ensure destination should be allowed for a redirect.
        return destination || '/';
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
module.exports.authorizers = {};
module.exports.authorizers.Github = Github;

function parseCookies(headers) {
    const cookieArr = headers.cookie || []

    return cookieArr.reduce((parsed, cookieObj) => {
        return Object.assign({}, parsed, cookie.parse(cookieObj.value))
    }, {})
}
