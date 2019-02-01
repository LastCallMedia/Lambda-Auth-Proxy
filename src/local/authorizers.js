const cookie = require('cookie');

class LocalAuthorizer {

    constructor(opts) {
        this.cookieName = opts.cookieName || '_logged_in';
        this.username = opts.username || 'ABC';
        this.password = opts.password || '123';
    }

    checkCredentials(enteredUsername, enteredPassword) {
        return ((enteredUsername === this.username) && (enteredPassword === this.password));
    }

    getAuthCookie() {
        return [{key: 'Set-Cookie', value: cookie.serialize(this.cookieName,  this.cookieName, {httpOnly: true, path:  '/'})}]
    }

    accessGranted(request) {
        const cookies = this.parseCookies(request.headers);
        return !!cookies[this.cookieName];
    }

    parseCookies(headers) {
        const cookieArr = headers.cookie || []

        return cookieArr.reduce((parsed, cookieObj) => {
            return Object.assign({}, parsed, cookie.parse(cookieObj.value))
        }, {})
    }

}

module.exports.LocalAuthorizer = LocalAuthorizer;