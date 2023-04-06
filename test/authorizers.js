
const {Github} = require('../src/oauth2/authorizers');

describe('Github', function() {

    let client;
    let mockGetAuthorizeUrl;

    beforeEach(function()  {
        const mockUseAuthorizationHeaderforGET = jest.fn();
        const mockGet = jest.fn((url, token, callback) => {
            switch(url) {
                case 'https://api.github.com/user':
                    callback(null, {
                        login: 'myuser'
                    })
                    return;
                case 'https://api.github.com/user/emails':
                    callback(null, JSON.stringify([
                        {
                            primary: false,
                            email: 'me@nonprimary.com'
                        },
                        {
                            primary: true,
                            email: 'me@primary.com'
                        }
                    ]))
                    return;
                case 'https://api.github.com/user/orgs?page=1&limit=200':
                    callback(null, JSON.stringify([
                        {login: 'org1'},
                    ]));
                    return;
                case 'https://api.github.com/user/orgs?page=2&limit=200':
                    callback(null, JSON.stringify([
                        {login: 'org2'},
                    ]));
                    return;
                case 'https://api.github.com/user/orgs?page=3&limit=200':
                    callback(null, JSON.stringify([]));
                    return;

                default:
                    callback(new Error('Unknown URL: ' + url))

            }
        });
        mockGetAuthorizeUrl = jest.fn();
        client = {
            useAuthorizationHeaderforGET: mockUseAuthorizationHeaderforGET,
            get: mockGet,
            getAuthorizeUrl: mockGetAuthorizeUrl
        }
    });

    test('It requests authorization with only the user:email scope by default',  function() {
        const authorizer = new Github();
        authorizer.client = client;
        authorizer.getAuthorizeUrl({});
        expect(mockGetAuthorizeUrl.mock.calls[0]).toEqual([{scope: 'user:email'}])
    })

    test('It requests authorization with the read:org scope when an organization requirement is made', function() {
        const authorizer = new Github();
        authorizer.client = client;
        authorizer.requireOrganizationMembership('foo')
        authorizer.getAuthorizeUrl({});
        expect(mockGetAuthorizeUrl.mock.calls[0]).toEqual([{scope: 'user:email read:org'}])
    })

    test.only('It populates user account data', async function() {
        const authorizer = new Github();
        authorizer.client = client;
        const account = await authorizer.authorize('foo');
        expect(account).toEqual({
            bearer: 'foo',
            username: 'myuser',
            email:  'me@primary.com'
        })
    });

    test('It fails authorization if the user does not have an email in the correct domain', async function() {
        const authorizer = new Github();
        authorizer.client = client;
        authorizer.requireEmailDomain('foo.com');
        await expect(authorizer.authorize('foo')).rejects.toEqual(new Error('This user (myuser) does not have an e-mail address with any of the required domains (foo.com)'));
    })

    test('It checks nonprimary e-mails when considering e-mail domains', async function() {
        const authorizer = new Github();
        authorizer.client = client;
        authorizer.requireEmailDomain('nonprimary.com');
        await expect(authorizer.authorize('foo')).resolves.toEqual({
            bearer: 'foo',
            username: 'myuser',
            email:  'me@nonprimary.com'
        })
    });

    test('It allows authorization if the user is a member of any required organization', async function() {
        const authorizer = new Github();
        authorizer.client = client;
        authorizer.requireOrganizationMembership('org2');
        await expect(authorizer.authorize('foo')).resolves.toBeTruthy();
    })

    test('It fails authorization if the user is not a member of the correct organization', async function() {
        const authorizer = new Github();
        authorizer.client = client;
        authorizer.requireOrganizationMembership('org3');
        await expect(authorizer.authorize('foo')).rejects.toEqual(new Error('This user (myuser) is not a member of any of the required organizations (org3)'));
    })






})


