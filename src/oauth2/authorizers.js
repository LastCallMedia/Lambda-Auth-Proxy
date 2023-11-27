
const OAuth = require('oauth').OAuth2;
const {promisify} = require('util');
const qs = require('querystring');

class Github {
    constructor(clientId, clientSecret, opts = {}) {
        const baseSite = opts.baseSite || 'https://github.com';
        const authorizePath = opts.authorizePath || '/login/oauth/authorize';
        const accessTokenPath  = opts.accessTokenPath || '/login/oauth/access_token';
        this.baseAPI = opts.baseAPI  || 'https://api.github.com';

        this.client = new OAuth(clientId, clientSecret, baseSite, authorizePath, accessTokenPath);
        this.client.useAuthorizationHeaderforGET(true)

        this.scopes = ['user:email']
        this.requiredDomains = [];
        this.requiredOrgs = [];
    }

    getAuthorizeUrl(params) {
        return this.client.getAuthorizeUrl(Object.assign({}, params, {
            scope: this.scopes.join(' ')
        }))
    }
    getOAuthAccessToken(code, params, callback) {
        return this.client.getOAuthAccessToken(code, params, callback)
    }
    getPromised(url, token) {
        return promisify(this.client.get.bind(this.client))(url, token);
    }
    async authorize(bearerToken)  {
        const username = await this.getUsername(bearerToken)
        await this.assertMemberOfRequiredOrgs(bearerToken, username)

        return  {
            bearer: bearerToken,
            username: username,
            email: await this.getEmail(bearerToken, username)
        }
    }
    async getUsername(bearerToken) {
        const account = await this.getPromised(`${this.baseAPI}/user`, bearerToken)
        return account.login
    }

    async getEmail(bearerToken, username) {
        const emails = JSON.parse(await this.getPromised(`${this.baseAPI}/user/emails`, bearerToken));
        let matching;
        if(this.requiredDomains.length) {
            matching = emails.filter(email => {
                const parts = email.email.split('@');
                return this.requiredDomains.includes(parts[1])
            })
            if(matching.length < 1) {
                throw new Error(`This user (${username}) does not have an e-mail address with any of the required domains (${this.requiredDomains.join(', ')})`)
            }
        }
        else {
            matching = emails.filter(email => email.primary)
        }

        return matching[0].email
    }

    requireEmailDomain(domain) {
        this.requiredDomains.push(domain)
    }

    requireOrganizationMembership(organization) {
        if(!this.scopes.includes('read:org')) {
            this.scopes.push('read:org');
        }
        this.requiredOrgs.push(organization)
    }

    async assertMemberOfRequiredOrgs(bearerToken, username) {
        if(this.requiredOrgs.length) {
            let page = 1;
            let response;
            do {
                const params = {page, limit: 200};
                response = JSON.parse(await this.getPromised(`${this.baseAPI}/user/orgs?${qs.stringify(params)}`, bearerToken))
                const matching = response.filter(o => this.requiredOrgs.includes(o.login))
                if(matching.length) {
                    return true
                }
                page++
            } while(response.length > 0);

            throw new Error(`This user (${username}) is not a member of any of the required organizations (${this.requiredOrgs.join(', ')})`);
            // @todo: Add required e-mail domain.
        }
        return Promise.resolve(true)
    }

}

module.exports.Github  = Github
