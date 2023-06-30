//import { uuid } from "./uuid";
const { uuid } = require("./uuid");
/**
 *
 */
class SessionTokenSets {
    session_bounded;
    session_carries;
    constructor() {
        this.session_bounded = new Set();
        this.session_carries = new Set();
    }
}
const default_token_maker = (prefix) => {
    let suuid = '' + uuid();
    let token = (prefix ? prefix : '') + suuid;
    return token;
};
/**
* A local manager of sessions and their state transition tokens.
*
*
* The session should always be recoverable from a token specifically designed for keying the state transions of the session.
* Other transition tokens should also identify the session, but will have no key into session state transitions,
* instead they will key into the state transitions of media, stream, or processes.
*
* Tokens can be lent by a proactive lender for the lifetime of the owner session (requires reference count)
* Tokens can be given by a proactive seller/giver in order to hand off state transitions to a seconday micro service
*
*/
class LocalSessionTokens {
    db;
    //
    session_to_owner;
    owner_to_session;
    token_to_owner;
    token_to_session;
    session_checking_tokens;
    token_to_information;
    sessions_to_their_tokens;
    //
    _token_creator;
    /**
     * @constructor
     * @param {DB} db_obj - A database reference which supports get, set, del for ephemeral and long timed LRU.
     * @param {token_lambda} [token_creator] - A method for making a token which will be used as a unique key into the database.
     */
    constructor(db_obj, token_creator) {
        this.db = db_obj;
        //
        this.session_to_owner = new Map(); // map to owner
        this.owner_to_session = new Map();
        this.token_to_owner = new Map(); // map to owner -- token belongs to owner (ucwid)
        this.token_to_session = new Map(); // token belons to session
        this.session_checking_tokens = new Map();
        this.token_to_information = new Map();
        this.sessions_to_their_tokens = new Map();
        //
        this._token_creator = token_creator ? token_creator : default_token_maker;
    }
    /**
     *  Calls upon the instance lambda in order to create a token for whatever use is intended.
     * @param {string} [prefix] - optionally put prefix the token whith an applicatino specfic string
     * @returns {token} -- a unique identifier relative to the running application scope (defind by the application)
     */
    create_token(prefix) {
        return this._token_creator(prefix);
    }
    /**
     * Given a transition token, adds it to the local tables plus the key value database.
     * @param {TransitionToken} token - a transition token which be part of a transition object.
     * @param {string} value - any string value less than a pre-determined size that can be stored.
     */
    async add_token(token, value) {
        if (typeof value !== 'string') {
            value = JSON.stringify(value);
        }
        if ((value !== undefined) && (token !== undefined)) {
            await this.db.set_key_value(token, value);
            this.token_to_information.set(token, value);
        }
    }
    async transition_token_is_active(token) {
        if (token) {
            let value = this.token_to_information.get(token);
            if (value !== undefined) {
                return value;
            }
            else {
                let key = await this.db.get_key_value(token);
                if ((key === null) || (key === false)) {
                    return (false);
                }
                else {
                    await this.add_token(token, key);
                    return (key);
                }
            }
        }
        return false;
    }
    /**
     * Given a transition token, removes it from the local tables plus the key value database.
     * @param {TransitionToken} token - a transition token which be part of a transition object.
     */
    destroy_token(token) {
        let session_token = this.token_to_session.get(token);
        if (session_token != undefined) {
            try {
                this.token_to_session.delete(token);
                this.db.del_key_value(token);
                this.token_to_owner.delete(token);
                let sess_token_set = this.sessions_to_their_tokens.get(session_token);
                if (sess_token_set) {
                    sess_token_set.session_bounded.delete(token);
                    sess_token_set.session_carries.delete(token);
                }
            }
            catch (e) {
                //
            }
        }
    }
    /**
     * Fetch the ownership key belonging to a token
     * @param {string} token - An ephemeral token for transitions sequences.
     * @returns {string} - the ownership key of the token e.g. a ucwid
     */
    from_token(token) {
        let owner_key = this.token_to_owner[token];
        return owner_key;
    }
    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     */
    async add_session(session_token, ownership_key, t_token) {
        // hash_of_p2  hash of the second parameter per the hasher provided by the caching module
        // e.g.hh unidentified (an intermediate hash) in LRU manager of global_session
        let hash_of_p2 = await this.db.set_session_key_value(session_token, ownership_key); // return hh unidentified == xxhash of value (value == ownership key)
        // later the session_token will be passed into get_session_key_value where it will be hashed into an augmented has token
        // for fetching hash_of_p2
        this.session_to_owner.set(session_token, ownership_key); // the session transition token 
        this.session_checking_tokens.set(session_token, hash_of_p2);
        this.token_to_owner.set(session_token, ownership_key);
        let sess_token_set = new SessionTokenSets();
        this.sessions_to_their_tokens.set(session_token, sess_token_set);
        //
        if (t_token) {
            this.token_to_session.set(t_token, session_token);
            sess_token_set.session_bounded.add(t_token);
            this.token_to_owner.set(t_token, ownership_key);
            await this.add_token(t_token, hash_of_p2);
        }
    }
    /**
     * Uses the hash value mapped by the session token along with the expected hash input to check for existence of the session
     */
    async active_session(session_token, ownership_key) {
        let hh_unidentified = this.session_checking_tokens.get(session_token);
        if (hh_unidentified) {
            let truth = await this.db.check_hash(hh_unidentified, ownership_key);
            return truth;
        }
        return false;
    }
    /**
    *  Removes a sessions from the general discourse of all micro services given the state transition token that that keys the session
    *  @param {string} token - a token that keys the state transitions of a session and can map to the session
    */
    destroy_session(token) {
        let session_token = this.token_to_session.get(token);
        if (session_token != undefined) {
            try {
                this.session_to_owner.delete(session_token); // the session transition token 
                this.session_checking_tokens.delete(session_token);
                this.token_to_owner.delete(token);
                this.sessions_to_their_tokens.delete(session_token);
                this.db.del_session_key_value(session_token);
            }
            catch (e) {
                //
            }
        }
    }
    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     */
    async add_transferable_token(t_token, value, ownership_key) {
        let session_token = this.owner_to_session.get(ownership_key);
        if (session_token !== undefined) {
            let sess_token_set = this.sessions_to_their_tokens.get(session_token);
            if (t_token && sess_token_set) {
                this.token_to_session.set(t_token, session_token);
                sess_token_set.session_carries.add(t_token);
                await this.add_token(t_token, value);
            }
        }
    }
    /**
     * Sets up a local transfer of token ownership
     */
    async transfer_token(t_token, yielder_key, receiver_key) {
        if (t_token && yielder_key && receiver_key) {
            //
            let y_session_token = this.owner_to_session.get(yielder_key);
            if (y_session_token) {
                let sess_token_set = this.sessions_to_their_tokens.get(y_session_token);
                if (sess_token_set && sess_token_set.session_carries.has(t_token)) {
                    //
                    this.destroy_token(t_token);
                    //
                    let r_session_token = this.owner_to_session.get(receiver_key);
                    if (r_session_token) { // the receiver has to have an active session seen from this runtime
                        this.token_to_session.set(t_token, r_session_token);
                        let sess_token_set = this.sessions_to_their_tokens.get(y_session_token);
                        sess_token_set?.session_carries.add(t_token);
                        this.token_to_owner.set(t_token, receiver_key);
                    }
                }
            } // no else --- there has to be an agent to transfer the ownerhip of a token
            //
        }
    }
}
class lilDB {
    set_session_key_value;
    del_session_key_value;
    set_key_value;
    get_key_value;
    del_key_value;
    check_hash;
    constructor(spec) {
        let self = this;
        for (let [fn, lambda] of Object.entries(spec)) {
            self[fn] = lambda;
        }
    }
}
let db = new lilDB({
    set_session_key_value: (session_token, ownership_key) => {
        "";
    },
    del_session_key_value: async (session_token) => { return true; },
    set_key_value: (token, value) => { },
    get_key_value: (token) => { false; },
    del_key_value: (token) => { },
    check_hash: async (hh_unidentified, ownership_key) => { true; }
});
new LocalSessionTokens(db, default_token_maker);
