
const {Proxy} = require('../');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

describe('Request interception', function() {
    let proxy;
    beforeEach(function() {
        proxy = new Proxy(new DummyAuthorizer(), {
            baseUrl: 'https://foo.bar',
            hashKey:  'foo',
            logger: dummyLogger
        });
    })
    test('Redirects unauthenticated requests to login', async function() {
        const proxy = new Proxy(new DummyAuthorizer(), {
            hashKey: 'foo'
        });
        const response = await proxy.handleRequest({
            uri: '/foo',
            headers: {}
        })
        expect(response.status).toEqual('302')
        expect(response.headers.location[0].value).toEqual('/auth/login?destination=%2Ffoo');
    });

    test('Allows authenticated requests', async function() {
        const proxy = new Proxy(new DummyAuthorizer('letmein'), {
            baseUrl: 'https://foo.bar',
            hashKey:  'foo'
        });
        const token = jwt.sign({bearer: 'accessgranted'}, 'foo');
        const request = {
            uri: '/foo',
            headers: {
                cookie: [
                    {key: 'cookie', value: cookie.serialize('_auth', token)}
                ]
            }
        }
        const response = await proxy.handleRequest(request);
        expect(response).toEqual(request)
    });
})

describe('Login endpoint', function() {
    let proxy;
    beforeEach(function() {
        proxy = new Proxy(new DummyAuthorizer(), {
            baseUrl: 'https://foo.bar',
            hashKey:  'foo',
            logger: dummyLogger
        });
    })
    test('Responds to request for login URL by  redirecting to authorize url', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/login',
            headers: {}
        })
        expect(response.status).toEqual('302')
        expect(response.headers.location[0].value).toEqual('https://auth.me/authorize?redirect_uri=https%3A%2F%2Ffoo.bar%2Fauth%2Fcallback&state=%2F');
    })
    test.skip('Sets a state cookie on redirecting to authorize url', async function() {

    });
})

describe('Logout endpoint', function() {
    let proxy;
    beforeEach(function() {
        proxy = new Proxy(new DummyAuthorizer(), {
            baseUrl: 'https://foo.bar',
            hashKey:  'foo',
            logger: dummyLogger
        });
    })
    test('Redirects to homepage on logout without destination', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/logout',
            headers: {}
        });
        expect(response.status).toEqual('302')
        expect(response.headers.location[0].value).toEqual('/');
    })

    test('Redirects to destination on logout with destination', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/logout',
            querystring: 'destination=%2Ffoo',
            headers: {}
        });
        expect(response.status).toEqual('302')
        expect(response.headers.location[0].value).toEqual('/foo');
    })

    test('Unsets the auth cookie on logout', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/logout',
            headers: {}
        });
        expect(response.headers["set-cookie"][0].value).toContain('; HttpOnly')
        expect(response.headers["set-cookie"][0].value).toContain('; Secure')
        const parsedCookie = cookie.parse(response.headers["set-cookie"][0].value);
        expect(parsedCookie._auth).toEqual('')
    });
});

describe('Callback endpoint', function() {
    let proxy;
    beforeEach(function() {
        proxy = new Proxy(new DummyAuthorizer('letmein'), {
            baseUrl: 'https://foo.bar',
            hashKey:  'foo',
            logger: dummyLogger
        });
    })

    test('Responds to callback for valid code by redirecting to destination', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/callback',
            querystring: 'code=letmein',
            headers: {}
        });
        expect(response.status).toEqual('302')
        expect(response.headers.location[0].value).toEqual('/')
    })

    test('Responds to callback for valid code by setting an auth cookie', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/callback',
            querystring: 'code=letmein',
            headers: {}
        });
        // Cookie should be secure and HttpOnly.
        expect(response.headers['set-cookie'][0].value).toContain('; HttpOnly')
        expect(response.headers['set-cookie'][0].value).toContain('; Secure')

        const tokenCookie = cookie.parse(response.headers['set-cookie'][0].value);
        const parsedToken = jwt.verify(tokenCookie._auth, 'foo');
        expect(parsedToken.bearer).toEqual('accessgranted');
    })


    test('Responds to callback for invalid code by throwing access denied', async function() {
        const response = await proxy.handleRequest({
            uri: '/auth/callback',
            querystring: 'code=invalidcode',
            headers: {}
        });
        expect(response.status).toEqual('403')
    })
})


const dummyLogger = {
    log: () => {},
    warn: () => {},
    error: () => {}
}

class DummyAuthorizer {
    constructor(validCode) {
        this.validCode = validCode
    }
    getAuthorizeUrl(params) {
        return `https://auth.me/authorize?${querystring.stringify(params)}`
    }
    getOAuthAccessToken(code, params, callback) {
        if(code === this.validCode) {
            callback(null, 'accessgranted', 'refreshgranted')
        }
        else {
            callback(new Error('Access denied'))
        }
    }
    authorize(token) {
        return {bearer: token}
    }
}
