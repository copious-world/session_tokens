
// tsc --target es2022 ts/default_session_token.ts
import {uuid} from "./uuid"
import {DB} from './iDB'
/**
 * const { uuid } = require("./uuid");
 */ 

const MINUTES = (1000*60)
const GENERAL_DEFAULT_SESSION_TIMEOUT = 60*MINUTES
const SESSION_CHOP_INTERVAL = 500;


type Hash = string;
type SessionToken = string;
type TransitionToken = string
type Ucwid = string
type Token = TransitionToken | SessionToken;


/**
 * @callback token_lambda -- a method that generates a token from a random number generator... does not make a hash 
 * @param {string} [prefix] -- optionally prefix the token whith an application specfic string
 * @returns {Token} -- a unique identifier relative to the running application scope (defind by the application)
 */
type token_lambda = ( prefix? : string ) => Token;


/**
 * A default token producer is available for implementations that omit
 * an application defined token producer
 */
const default_token_maker: token_lambda = ( prefix? : string ) => {
    let suuid : string = '' + uuid()
    let token : Token = (prefix ? prefix : '') + suuid
    return token
};




/**
 * Collects all the tokens belonging to a session into one data structure.
 * This object refers to two sets
 * 1. one that contains the tokens that must be destroyed when the session is destroyed.
 * 2. a second that contains the tokens that may be transfered to another session and owner.
 * 
 * Tokens belonging to sessions are usually used to manage a state machine's progress with regard to 
 * actions taking place between a client and a service. These tokens might be passed between backend services (micor-services)
 * that manage information in relation to a session established for some user.
 */
class SessionTokenSets {
    session_bounded : Set<TransitionToken>
    session_carries : Set<TransitionToken>
    constructor() {
        this.session_bounded = new Set<TransitionToken>()
        this.session_carries = new Set<TransitionToken>()
    }
}

/**
 * Transferable tokens may be moved to another owner at any time a session owner allows it.
 * By virue of being in a set of transferable tokens, the token is tansferable.
 * The token may additionally be sellable at some price, which may positive or negative.
 * Other useful properties may be added later that apply only to transferable tokens.
 */
class TransferableTokenInfo {

    _sellable : boolean;
    _price: Number;
    _owner : Ucwid

    constructor(owner : Ucwid) {
        this._sellable = false
        this._price = 0.0
        this._owner = owner
    }

    set_all(stored_info : Object) {
        let self = this
        for ( let ky in stored_info ) {
            self[ky] = stored_info[ky]
        }
    }

}


/**
 * There are several situations in which a sesion may be used in a time-sensitive way.
 * This class puts them in a single record for storage in a sinlge local table.
 * Many times, a token's timing roles may be manipulated at once. Hence, keeping the token in a table for each case
 * will increase the algorithmic time a token's updates will require.
 */
class SessionTimingInfo {

    _detachment_allowed : boolean;
    _is_detached : boolean;   // a session is detached when its owner has logged out but returning is allowed
    _time_left : number;
    _time_left_after_detachment : number;
    _time_allotted : number;
    _shared : boolean;

    constructor(default_timeout : number) {
        this._detachment_allowed = false;
        this._is_detached = false;
        this._time_left = default_timeout;
        this._time_left_after_detachment = 0;
        this._time_allotted = default_timeout;
        this._shared = false;
    }

    set_all(stored_info : Object) {
        let self = this
        for ( let ky in stored_info ) {
            self[ky] = stored_info[ky]
        }
    }

}



/**
 * There are several situations in which a token may be used in a time-sensitive way.
 * This class puts them in a single record for storage in a sinlge local table.
 * Many times, a token's timing roles may be manipulated at once. Hence, keeping the token in a table for each case
 * will increase the algorithmic time a token's updates will require.
 */
class TokenTimingInfo {

    _detachment_allowed : boolean;
    _is_detached : boolean;
    _time_left : number;
    _time_left_after_detachment : number;
    _time_allotted : number;

    constructor(default_timeout : number | undefined) {
        this._detachment_allowed = false;
        this._is_detached = false;
        if ( isNaN(default_timeout) ) {
            this._time_left = 0;
            this._time_left_after_detachment = 0;
            this._time_allotted = 0;    
        } else {
            this._time_left = default_timeout;
            this._time_left_after_detachment = 0;
            this._time_allotted = default_timeout;    
        }
    }

    set_all(stored_info : Object) {
        let self = this
        for ( let ky in stored_info ) {
            self[ky] = stored_info[ky]
        }
    }
    
}



/**
 * Maintaining an abstract interface if only to establish a gazetter into the methods and 
 * provide interface structures for translations to other languages using, e.g., traits, abstract classes, etc.
 */
export interface TokenTablesAbstract {
    decrement_timers : () => void
    set_token_creator : (token_creator: token_lambda | undefined) => void
    //
    add_session : (session_token : SessionToken, ownership_key : Ucwid, t_token : TransitionToken, shared? : boolean ) => Promise<Hash | undefined>
    active_session : (session_token : SessionToken, ownership_key : Ucwid) => Promise<boolean>
    destroy_session : (t_token : TransitionToken) => void
    allow_session_detach : (session_token : SessionToken) => void
    detach_session : (session_token : SessionToken) => void
    attach_session : (session_token : SessionToken) => void
    //
    create_token : ( prefix? : string ) => Token
    add_token : (t_token : TransitionToken, value : string | object ) => Promise<void>
    transition_token_is_active : (t_token : TransitionToken) =>  Promise<boolean | string>
    from_token : (t_token : TransitionToken) => Ucwid
    add_transferable_token : ( t_token : TransitionToken, value : string | object, ownership_key : Ucwid ) => Promise<void>
    add_session_bounded_token : ( t_token : TransitionToken, value : string | object, ownership_key : Ucwid ) => Promise<void>
    acquire_token : (t_token : TransitionToken, session_token : SessionToken, owner : Ucwid) => Promise<boolean>
    token_is_transferable : (t_token : TransitionToken)  =>  boolean
    transfer_token : ( t_token : TransitionToken, yielder_key : Ucwid,  receiver_key : Ucwid ) => void
    destroy_token : (t_token : TransitionToken) => void
    //
    set_general_session_timeout : (timeout : number) => void
    set_session_timeout : (session_token : SessionToken,timeout : number) => void
    get_session_timeout : (session_token : SessionToken) => number | undefined
    get_session_time_left : (session_token : SessionToken) => number | undefined
    //
    set_general_token_timeout : (timeout : number) => void
    set_disownment_token_timeout : (t_token : TransitionToken,timeout : number) => void
    set_token_timeout : (t_token : TransitionToken,timeout : number) => void
    get_token_timeout : (t_token : TransitionToken)  =>  number | undefined 
    get_token_time_left(t_token : TransitionToken) : number | undefined
    set_token_sellable : (t_token : TransitionToken, amount? : Number) => void
    unset_token_sellable : (t_token : TransitionToken) => void
    //
    reload_session_info(session_token : SessionToken, ownership_key : Ucwid, hash_of_p2 : Hash) : Promise<boolean> 
    reload_token_info(t_token : TransitionToken) : Promise<void>
    //
    list_tranferable_tokens : (session_token : SessionToken) =>  Promise<TransitionToken[]>
    list_sellable_tokens : () =>  Promise<TransitionToken[]>
    map_sellable_tokens() : Promise<Object>
    list_unassigned_tokens : () =>  Promise<TransitionToken[]>
    list_detached_sessions : () =>  Promise<SessionToken[]>
}



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
 * Note that session time and token timing are different. Usually, a token is bound by a session , i.e. if the session expires,
 * then the token expires even if the token has more time alloted. But, a token might be transferable or its expiration may be
 * defered to a process other than the authorization process.
 *
 */

export class TokenTables implements TokenTablesAbstract {

    _db : DB;
    //
    _session_to_owner : Map<SessionToken,Ucwid>;    // bidirectional => tokens <-> owner
    _owner_to_session : Map<Ucwid,SessionToken>;
    _session_checking_tokens : Map<SessionToken,string>;
    _detached_sessions :  Set<SessionToken>;        // set 
    //
    _token_to_owner : Map<Token,Ucwid>;                     // token -> owner  (owner -> session)
    _token_to_session : Map<TransitionToken,SessionToken>;  // token -> session
    _sessions_to_their_tokens :  Map<SessionToken,SessionTokenSets>;    // session -> token[]
    //
    _token_to_information : Map<TransitionToken,string>;                // token -> 1 of any application info 
    _orphaned_tokens : Set<TransitionToken>;
    _all_tranferable_tokens : Map<TransitionToken,TransferableTokenInfo>;   // token -> specific token info
    //
    // timing sessions and tokens
    _token_timing : Map<TransitionToken,TokenTimingInfo>;
    _session_timing : Map<SessionToken,SessionTimingInfo>;
    //
    _session_time_chopper : number;         // all timers chopped down at interval completion.
    _general_session_timeout : number;      // override module constant or it is initialized to module constant
    _general_token_timeout : number;        // override module constant or it is initialized to module constant
    //
    _token_creator : token_lambda;          // producer function should be passed in from configuration

    /**
    * @constructor
    * @param {DB} db_obj - A database reference which supports get, set, del for ephemeral and long timed LRU.
    * @param {token_lambda} [token_creator] - A method for making a token which will be used as a unique key into the database.
    */
   constructor(db_obj : DB, token_creator: token_lambda | undefined) {
        this._db = db_obj
        //
        this._session_to_owner = new Map<SessionToken,Ucwid>();      // map to owner
        this._owner_to_session = new Map<Ucwid,SessionToken>();
        this._token_to_owner = new Map<TransitionToken,Ucwid>();        // map to owner -- token belongs to owner (Ucwid)
        this._token_to_session = new Map<TransitionToken,SessionToken>();    // token belons to session
        this._session_checking_tokens = new Map<SessionToken,string>();
        this._token_to_information = new Map<TransitionToken,any>();
        this._sessions_to_their_tokens = new Map<SessionToken,SessionTokenSets>();

        //
        this._detached_sessions = new Set<SessionToken>();
        this._orphaned_tokens = new Set<TransitionToken>();
        //
        this._session_timing = new Map<SessionToken,SessionTimingInfo>();
        this._all_tranferable_tokens = new Map<TransitionToken,TransferableTokenInfo>
        this._token_timing = new Map<TransitionToken,TokenTimingInfo>();
        //
        this._token_creator = token_creator ? token_creator : default_token_maker
        //
        this._general_session_timeout = GENERAL_DEFAULT_SESSION_TIMEOUT
        this._session_time_chopper = setInterval(() => (this.decrement_timers()), SESSION_CHOP_INTERVAL);
        this._general_token_timeout = Infinity
    }


    /**
     * 
     */
    shutdown() {
        if ( this._session_time_chopper ) clearInterval(this._session_time_chopper)
    }

    /**
     * 
     */
    decrement_timers() {
        for (let [sess_tok, time_info] of this._session_timing.entries() ) {
            if ( time_info._is_detached ) {
                let time_left = time_info._time_left_after_detachment
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._session_timing.delete(sess_tok)
                    this.destroy_token(sess_tok)
                } else {
                    time_info._time_left_after_detachment = time_left
                }
            } else {
                let time_left = time_info._time_left
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._session_timing.delete(sess_tok)
                    this.destroy_token(sess_tok)
                }  else {
                    time_info._time_left = time_left;
                }
            }
            //
            if ( time_info._shared ) { // session information only
                (async () => {  // update this shared information
                    await this._db.set_key_value(sess_tok,JSON.stringify(time_info))
                })()    
            }
        }
        for ( let [t_tok, time_info] of this._token_timing.entries() ) {
            if ( time_info._is_detached ) {
                let time_left = time_info._time_left_after_detachment
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._token_timing.delete(t_tok)
                    this.destroy_token(t_tok)
                } else {
                    time_info._time_left_after_detachment = time_left
                }
            } else {
                let time_left = time_info._time_left
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._token_timing.delete(t_tok)
                    this.destroy_token(t_tok)
                }  else {
                    time_info._time_left = time_left
                }
            }
        }
    }


    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key. Here, the database DB is a key-value
     * database which provides services to the client micro-services. 
     * 
     * In any event, the session token is set in the DB as the key to the identification of the session owner. Micro service clients
     * will be provided the session token and check for ownership identity before providing services.
     * 
     * The parameter `shared` is required in order to make the session timing information available to other processes that 
     * share the session table. When the `shared` parameter is **true**, this method returns a value.
     * 
     * *Recommendation*: if using the returned value, it should be kept safe and sent via a communication channel to cooperating micro services
     *
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {Ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     * @param {TransitionToken} [t_token] -- a key into the token tables from which the session should be recoverable.
     * @param {bool} [shared] - if supplied, then information about the session will be stored in a shared DB
     * @returns {Promise<Hash | undefined> } If the share parameter is used, then this will be a key for checking the activity of the session.
     */
    async add_session(session_token : SessionToken, ownership_key : Ucwid, t_token? : TransitionToken, shared? : boolean ) : Promise<Hash | undefined> {
        // hash_of_p2  hash of the second parameter per the hasher provided by the caching module
        // e.g.hh unidentified (an intermediate hash) in LRU manager of global_session
        let hash_of_p2 = await this._db.set_session_key_value(session_token,ownership_key)  // return hh unidentified == xxhash of value (value == ownership key)
        // later the session_token will be passed into get_session_key_value where it will be hashed into an augmented hash token
        // for fetching the ownership key
        //
        // local copies... 
        this._session_to_owner.set(session_token,ownership_key) // the session transition token
        this._session_checking_tokens.set(session_token,hash_of_p2)  
        this._token_to_owner.set(session_token,ownership_key)
        //
        let sess_token_set = new SessionTokenSets()  // if this methods is called twice, the session token sets will be overwritten.
        this._sessions_to_their_tokens.set(session_token,sess_token_set);
        //
        if ( t_token ) {  // in some cases a token (keyed to some activity of the authorization process) is available when the session is created.
            this._token_to_session.set(t_token, session_token)  // also given token find session 
            sess_token_set.session_bounded.add(t_token)         // assume bounded by session 
            this._token_to_owner.set(t_token,ownership_key)     // given token find owner of session 
            await this.add_token(t_token, hash_of_p2)           // all things to add tokens
        }
        //
        let sti : SessionTimingInfo = new SessionTimingInfo(this._general_session_timeout)
        this._session_timing.set(session_token,sti)             // local session timing (in auth service)
        //
        if ( shared ) {                                         // beyond the auth service.
            sti._shared = true
            let value = JSON.stringify(sti)
            await this._db.set_key_value(session_token,value)
            return hash_of_p2
        }
        return // no value === undefined
    }

    
    /**
     * Uses the hash value mapped by the session token along with the expected hash input to check for existence of the session
     */
    async active_session(session_token : SessionToken, ownership_key : Ucwid) : Promise<boolean> {
        let hh_unidentified = this._session_checking_tokens.get(session_token)
        if ( hh_unidentified ) {
            let truth = await this._db.check_hash(hh_unidentified,ownership_key)
            return truth
        }
        return false
    }


    /**
    *  Removes a sessions from the general discourse of all micro services given the state transition token that that keys the session
    *  @param {string} token - a token that keys the state transitions of a session and can map to the session
    */
    destroy_session(t_token : TransitionToken) {
       let session_token = this._token_to_session.get(t_token);
       if ( session_token != undefined ) {
            try {
                this.attach_session(session_token) // if it might be in the set of detached sessions.
                //
                this._session_to_owner.delete(session_token) // the session transition token 
                this._session_checking_tokens.delete(session_token)

                let time_info = this._session_timing.get(session_token)
                this._session_timing.delete(session_token)
                //
                if ( time_info && time_info._shared ) {
                    (async () => {  // update this shared information
                        await this._db.del_key_value(session_token)
                    })()    
                }
                //
                let token_sets : SessionTokenSets | undefined = this._sessions_to_their_tokens.get(session_token)
                if ( token_sets !== undefined ) {
                    for ( let token of token_sets.session_carries ) {
                        this._orphaned_tokens.add(token)            // orphaned
                    }
                    for ( let token of token_sets.session_bounded ) {
                        this.destroy_token(token)
                    }
                }
                this._sessions_to_their_tokens.delete(session_token);
                //
                this._db.del_session_key_value(session_token)
                this._token_to_owner.delete(session_token)
           } catch (e) {
               //
           }
       }
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


    /**
     * Calls upon the instance lambda in order to create a token for whatever use is intended.
     * @param {string} [prefix] - optionally put prefix the token whith an applicatino specfic string
     * @returns {token} -- a unique identifier relative to the running application scope (defind by the application)
     */
    create_token( prefix? : string ) : Token {
        return this._token_creator(prefix)
    }

    /**
     * Provided if any lazy configuration requirement must set the token creator after construction
     * @param token_creator
     */
    set_token_creator(token_creator: token_lambda | undefined) {
        this._token_creator = token_creator ? token_creator : default_token_maker
    }


    /**
     * Given a transition token, adds it to the local tables plus the key value database.
     * Only maps the token to its information (value) and to its timing status.
     * Ownership and transferability is handled by calling methods.
     * 
     * @param {TransitionToken} token - a transition token which be part of a transition object.
     * @param {string} value - any string value less than a pre-determined size that can be stored.
     */
    async add_token(t_token : TransitionToken, value : string | object ) {
        if ( typeof value !== 'string' ) {
            value = JSON.stringify(value)
        }
        if ( (value !== undefined) && (t_token !== undefined) ) {
            await this._db.set_key_value(t_token,value)
            this._token_to_information.set(t_token,value)
            this._token_timing.set(t_token, new TokenTimingInfo((this._general_token_timeout < Infinity) ? this._general_token_timeout : undefined));
        }
    }


    /**
     * 
     * @param token 
     * @returns Promise<boolean | string>
     */
    async transition_token_is_active(t_token : TransitionToken) :  Promise<boolean | string> {
        if ( t_token ) {
            let value = this._token_to_information.get(t_token)
            if ( value !== undefined ) {
                return value
            } else {
                let t_info_str = await this._db.get_key_value(t_token)
                if ( typeof t_info_str !== 'string' ) {
                    return (false)
                } else {
                    await this.add_token(t_token,t_info_str)
                    return (t_info_str)
                }
            }
        }
        return false
    }
    

   /**
    * Fetch the ownership key belonging to a token
    * @param {string} token - An ephemeral token for transitions sequences.
    * @returns {string} - the ownership key of the token e.g. a Ucwid
    */
    from_token(t_token : TransitionToken) : Ucwid {
        let owner_key = this._token_to_owner.get(t_token)
        if ( owner_key !== undefined ) {
            return owner_key
        } else {
            return ""
        }
    }


    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {Ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     */
    async add_transferable_token( t_token : TransitionToken, value : string | object, ownership_key : Ucwid ) {
        let session_token : SessionToken | undefined = this._owner_to_session.get(ownership_key)
        if ( session_token !== undefined ) {
            let sess_token_set = this._sessions_to_their_tokens.get(session_token);
            if ( t_token && sess_token_set ) {
                this._token_to_owner.set(t_token,ownership_key)
                this._token_to_session.set(t_token, session_token)
                sess_token_set.session_carries.add(t_token)
                //
                let t_info = new TransferableTokenInfo(ownership_key)
                if ( typeof value === 'string' ) {
                    let o_value = JSON.parse(value)
                    o_value._owner = ownership_key   // just in case
                    value = o_value
                }
                t_info.set_all(value)
                //
                this._all_tranferable_tokens.set(t_token,t_info) // if it is in this set, it is transferable
                //
                let store_value : string = JSON.stringify(value)
                await this.add_token(t_token,store_value)   // add to token_timing, token_to_info, and db
                let token_timing = this._token_timing.get(t_token)
                if ( token_timing ) {
                    token_timing._detachment_allowed = true
                }
            }
        }
    }

    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * 
     * This method does not make the token transferable. 
     * 
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {Ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     */
    async add_session_bounded_token( t_token : TransitionToken, value : string | object, ownership_key : Ucwid ) {
        let session_token : SessionToken | undefined = this._owner_to_session.get(ownership_key)
        if ( session_token !== undefined ) {
            let sess_token_set = this._sessions_to_their_tokens.get(session_token);
            if ( t_token && sess_token_set ) {
                this._token_to_session.set(t_token, session_token)
                sess_token_set.session_bounded.add(t_token);  // the tokens this session (hence, owner) bounds (and owns)
                this._token_to_owner.set(t_token,ownership_key)  // from the token (unique) to the owner
                // it may be transfered... later this can be removed or used.
                await this.add_token(t_token,value)
            }
        }
    }

        
    /**
     * 
     * @param t_token 
     * @returns 
     */
    token_is_transferable(t_token : TransitionToken) : boolean {
        let tinf : TransferableTokenInfo | undefined = this._all_tranferable_tokens.get(t_token)
        if ( tinf ) {
            return true
        }
        return false
    }


    /**
     * Sets up a local transfer of token ownership
     * @param t_token 
     * @param yielder_key 
     * @param receiver_key 
     */
    async transfer_token( t_token : TransitionToken, yielder_key : Ucwid,  receiver_key : Ucwid ) : Promise<void> {
        if ( t_token && yielder_key && receiver_key ) {
            let bipass = false
            if ( this._orphaned_tokens.has(t_token) ) {
                bipass = true
            }
            let y_session_token = bipass ? '' : this._owner_to_session.get(yielder_key)
            if ( y_session_token ) {
                let sess_token_set = this._sessions_to_their_tokens.get(y_session_token);
                if ( (bipass || sess_token_set) && (!bipass ? sess_token_set?.session_carries.has(t_token) : bipass) ) {
                    //
                    let t_info_str = this._token_to_information.get(t_token)
                    this.destroy_token(t_token)  // remove from orphaned tokens and others
                    //
                    let r_session_token = this._owner_to_session.get(receiver_key)
                    if ( r_session_token ) {        // the receiver has to have an active session seen from this runtime
                        this._token_to_information.set(t_token,t_info_str as string)
                        this._token_to_session.set(t_token,r_session_token)
                        //
                        let value = await this.transition_token_is_active(t_token)  // returns a token info obj in a JSON string
                        if ( typeof value === 'string' ) {
                            let obj = JSON.parse(value)
                            this.add_transferable_token(t_token, obj, receiver_key)
                        }
                    }
                }
            }  // no else --- there has to be an agent to transfer the ownerhip of a token
        }
    }


    /**
     * If a process has been granted a token, it will have info stored in the shared DB 
     * But, it will not be in local tables, which will be used to identify it.
     * @param t_token 
     * @param session_token 
     * @param owner 
     * @returns 
     */
    async acquire_token(t_token : TransitionToken, session_token : SessionToken, owner : Ucwid) : Promise<boolean> {
        let value = await this.transition_token_is_active(t_token)  // returns a token info obj in a JSON string
        if ( typeof value === 'string' ) {
            this._token_to_session.set(t_token,session_token)
            let obj = JSON.parse(value)
            this.add_transferable_token(t_token, obj, owner)
        }
        return false
    }



    /**
     * Given a transition token, removes it from the local tables plus the key value database. 
     * @param {TransitionToken} token - a transition token which be part of a transition object.
     */
    destroy_token(t_token : TransitionToken) {
        let session_token = this._token_to_session.get(t_token);
        if ( session_token != undefined ) {
        try {
            this._token_to_session.delete(t_token)
            this._token_to_information.delete(t_token)
            this._db.del_key_value(t_token)
            this._token_to_owner.delete(t_token)
            this._orphaned_tokens.delete(t_token)
            this._token_timing.delete(t_token)
            this._all_tranferable_tokens.delete(t_token)
            let sess_token_set = this._sessions_to_their_tokens.get(session_token);
            if ( sess_token_set ) {
                sess_token_set.session_bounded.delete(t_token)
                sess_token_set.session_carries.delete(t_token)
            }
        } catch (e) {
            //
        }
    }
}

    // --- session timing 

    /**
     * 
     * @param timeout 
     */
    set_general_session_timeout(timeout : number) : void  {
        this._general_session_timeout = timeout
    }

    // per session 
    /**
     * 
     * @param session_token 
     * @param timeout 
     */
    set_session_timeout(session_token : SessionToken,timeout : number) : void {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            s_time_info._time_allotted = timeout
            s_time_info._time_left = timeout
            if ( s_time_info._shared ) {
                (async () => {  // update this shared information
                    await this._db.set_key_value(session_token,JSON.stringify(s_time_info))
                })()    
            }
        }
    }

    /**
     * 
     * @param session_token 
     * @returns 
     */
    get_session_timeout(session_token : SessionToken) : number | undefined {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            return s_time_info._time_allotted
        }
        return undefined
    }


    /**
     * 
     * @param session_token 
     * @returns 
     */
    get_session_time_left(session_token : SessionToken) : number | undefined {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            return s_time_info._time_left
        }
        return undefined
    }

    /**
     * 
     * @param session_token 
     */
    allow_session_detach(session_token : SessionToken) : void {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            s_time_info._detachment_allowed = true
        }
    }

    /**
     * 
     * @param session_token 
     */
    detach_session(session_token : SessionToken) : void {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            s_time_info._is_detached = false
            this._detached_sessions.add(session_token)
            if ( s_time_info._shared ) {
                (async () => {  // update this shared information
                    await this._db.set_key_value(session_token,JSON.stringify(s_time_info))
                })()    
            }
        }
    }

    /**
     * 
     * @param session_token 
     */
    attach_session(session_token : SessionToken) : void {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            s_time_info._is_detached = true
            this._detached_sessions.delete(session_token)
            if ( s_time_info._shared ) {
                (async () => {  // update this shared information
                    await this._db.set_key_value(session_token,JSON.stringify(s_time_info))
                })()    
            }
        }
    }

    // --- token timing 

    /**
     * 
     * @param timeout 
     */
    set_general_token_timeout(timeout : number) : void {
        this._general_token_timeout = timeout
    }

    /**
     * 
     * @param t_token 
     * @param timeout 
     */
    set_disownment_token_timeout(t_token : TransitionToken,timeout : number) : void {
        let time_info = this._token_timing.get(t_token)
        if ( time_info !== undefined && time_info._detachment_allowed ) {
            time_info._time_left_after_detachment = timeout
        }
    }

    /**
     * 
     * @param t_token 
     * @param timeout 
     */
    set_token_timeout(t_token : TransitionToken,timeout : number) : void {
        let time_info = this._token_timing.get(t_token)
        if ( time_info !== undefined ) {
            time_info._time_allotted = timeout
            time_info._time_left = timeout
        }
    }

    /**
     * 
     * @param t_token 
     * @returns 
     */
    get_token_timeout(t_token : TransitionToken) : number | undefined {
        let time_info = this._token_timing.get(t_token)
        if ( time_info !== undefined ) {
            return time_info._time_allotted
        }
        return undefined
    }

    /**
     * 
     * @param t_token 
     * @returns 
     */
    get_token_time_left(t_token : TransitionToken) : number | undefined {
        let time_info = this._token_timing.get(t_token)
        if ( time_info !== undefined ) {
            return time_info._time_left
        }
        return undefined
    }

    /**
     * 
     * @param t_token 
     * @param amount 
     */
    set_token_sellable(t_token : TransitionToken, amount? : Number) : void {
        let tinf : TransferableTokenInfo | undefined = this._all_tranferable_tokens.get(t_token)
        if ( tinf ) {
            if ( amount !== undefined ) {
                tinf._price = amount
            }
            tinf._sellable = true    
        }
    }

    /**
     * 
     * @param t_token 
     */
    unset_token_sellable(t_token : TransitionToken) : void {
        let tinf : TransferableTokenInfo | undefined = this._all_tranferable_tokens.get(t_token)
        if ( tinf ) {
            tinf._sellable = false
        }
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * The reload methods are particularly useful for consumers of the session information.
     * The information will be stored in tables that can be queried, but the tables for updating
     * will not be populated with their information. This state of affairs results in a quasi read-only
     * property of session information. This is perhaps more form a developers point of view; it being harder to use the 
     * information to create a command of it, thereby leaving the command of change to the creator of the token.
     * However, it is not an absolute, and it is recommended that the token sharing only occur between processes and processors 
     * that within a particular security realm.
     *
     * @param {SessionToken} session_token -- should identify an active token in the shared DB
     * @param {Ucwid} ownership_key -- owner of session token
     * @param {Hash} hash_of_p2 - must be supplied by deserializer or inviting process
     */
    async reload_session_info(session_token : SessionToken, ownership_key : Ucwid, hash_of_p2 : Hash) : Promise<boolean> {
        let data = await this._db.get_key_value(session_token)
        if ( await this.active_session(session_token, ownership_key) && (typeof data === 'string')) {
            let stored_info = JSON.parse(data)
            let s_info = new SessionTimingInfo(this._general_session_timeout)
            s_info.set_all(stored_info)
            this._session_timing.set(session_token,s_info)
            this._session_checking_tokens.set(session_token,hash_of_p2)
            return true
        }
        return false
    }

    /**
     * The reload methods are particularly useful for consumers of the token information.
     * The information will be stored in tables that can be queried, but the tables for updating
     * will not be populated with their information. This state of affairs results in a quasi read-only
     * property of token information. This is perhaps more form a developers point of view; it being harder to use the 
     * information to create a command of it, thereby leaving the command of change to the creator of the token.
     * However, it is not an absolute, and it is recommended that the token sharing only occur between processes and processors 
     * that within a particular security realm.
     * @param t_token 
     */
    async reload_token_info(t_token : TransitionToken) : Promise<void> {
        let data = await this._db.get_key_value(t_token)
        if ( typeof data === 'string' ) {
            let stored_info = JSON.parse(data)
            let t_info = new TokenTimingInfo((this._general_token_timeout < Infinity) ? this._general_token_timeout : undefined)
            t_info.set_all(stored_info)
            this._token_timing.set(t_token,t_info)
        }
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /**
     * These list methods return promises in case a descendant prefers to use DB storage
     * @param session_token 
     * @returns - a promise to deliver an array of TransitionToken
     */
    async list_tranferable_tokens(session_token : SessionToken) : Promise<TransitionToken[]> {
        let sess_info = this._session_timing.get(session_token)
        if (sess_info !== undefined) {
            let sess_token_set = this._sessions_to_their_tokens.get(session_token);
            if ( sess_token_set ) {
                return Array.from(sess_token_set.session_carries)
            }
        }
        return []
    }

    /**
     * These list methods return promises in case a descendant prefers to use DB storage
     * @returns  - a promise to deliver an array of TransitionToken
     */
    async list_sellable_tokens() : Promise<TransitionToken[]> {
        let transferables = Array.from(this._all_tranferable_tokens.keys());
        transferables = transferables.filter((tok_key) => {
            let t_inf = this._all_tranferable_tokens.get(tok_key)
            if ( t_inf !== undefined ) {
                return t_inf._sellable
            }
        })
        return transferables
    }

    /**
     * These list and map methods return promises in case a descendant prefers to use DB storage
     * @returns  - a promise to deliver an map of TransitionToken to prices
     */
    async map_sellable_tokens() : Promise<Object> {
        let seller_map = {}
        for ( let [token,t_inf]  of this._all_tranferable_tokens.entries() ) {
            if ( t_inf._sellable ) {
                seller_map[token] = t_inf._price
            }
        }
        return seller_map
    }
    

    /**
     * These list methods return promises in case a descendant prefers to use DB storage
     * @returns  - a promise to deliver an array of TransitionToken
     */
    async list_unassigned_tokens() : Promise<TransitionToken[]> {
        return Array.from(this._orphaned_tokens)
    }

    /**
     * These list methods return promises in case a descendant prefers to use DB storage
     * @returns  - a promise to deliver an array of SessionToken
     */
    async list_detached_sessions() : Promise<SessionToken[]> {
        return Array.from(this._detached_sessions)
    }

}

