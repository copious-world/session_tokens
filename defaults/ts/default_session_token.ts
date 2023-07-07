
// tsc --target es2022 ts/default_session_token.ts
import {uuid} from "./uuid"
// const { uuid } = require("./uuid");

type hash = string;
type SessionToken = string;
type TransitionToken = string
type ucwid = string
type Token = TransitionToken | SessionToken;


/**
 * @callback token_lambda -- a method that generates a token from a random number generator... does not make a hash 
 * @param {string} [prefix] -- optionally prefix the token whith an application specfic string
 * @returns {Token} -- a unique identifier relative to the running application scope (defind by the application)
 */
type token_lambda = ( prefix? : string ) => Token;

const MINUTES = (1000*60)
const GENERAL_DEFAULT_SESSION_TIMEOUT = 60*MINUTES
const SESSION_CHOP_INTERVAL = 500;

/**
 * DB interfaces are supplied in order to ensure that a session can last outside the 
 * lifetime of an executable, given that the excecutable may fail or that a session may be put on pause.
 * The DB interfaces also provides a formalism for sharing information between microservices.
 * 
 * The DB interface specifies methods that handle different kinds of database relationships.
 * It is expected that the session keys will be in kind, while general tokens will be in 
 * another kind, a key value database for instance. Optionally, it can be a different kind of implementation,
 * for a key value stored, but if the same as for sessions, it is expected to be another instance.
 * 
 * Different applications may have different key value databases. For instance, 
 * some may be global persistence databases, while some may be shared memory caches, like those
 * provided by global_session. But, even if they are the same, the session data base will store a hash of data
 * identifying the session, while the token database will store actual values; where, the values stored in the database
 * may be keys or serializations of share token data.
 */

interface DB {
    set_session_key_value : (session_token : SessionToken, ownership_key : ucwid) => hash;
    del_session_key_value : (session_token : SessionToken) => Promise<boolean>;
    set_key_value : (t_token : TransitionToken, value :string) => void;
    get_key_value : (t_token : TransitionToken) => Promise<string | boolean>;
    del_key_value : (t_token : TransitionToken) => void;
    check_hash  :   (hh_unidentified : string, ownership_key : ucwid) => Promise<boolean>;
}



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

    constructor() {
        this._sellable = false
        this._price = 0.0
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
    _time_left : Number;
    _time_left_after_detachment : Number;
    _time_allotted : Number;

    constructor(default_timeout : Number) {
        this._detachment_allowed = false;
        this._is_detached = false;
        this._time_left = default_timeout;
        this._time_left_after_detachment = 0;
        this._time_allotted = default_timeout;    
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
    _time_left : Number;
    _time_left_after_detachment : Number;
    _time_allotted : Number;

    constructor() {
        this._detachment_allowed = false;
        this._is_detached = false;
        this._time_left = 0;
        this._time_left_after_detachment = 0;
        this._time_allotted = 0;    
    }
}



/**
 * Maintaining an abstract interface if only to establish a gazetter into the methods and 
 * provide interface structures for translations to other languages using, e.g., traits, abstract classes, etc.
 */
interface LocalSessionTokensAbstract {
    decrement_timers : () => void;
    create_token : ( prefix? : string ) => Token;
    add_token : (t_token : TransitionToken, value : string | object ) => Promise<void>;
    transition_token_is_active : (t_token : TransitionToken) =>  Promise<boolean | string>;
    destroy_token : (t_token : TransitionToken) => void;
    from_token : (t_token : TransitionToken) => ucwid;
    add_session : (session_token : SessionToken, ownership_key : ucwid, t_token : TransitionToken ) => Promise<void>;
    active_session : (session_token : SessionToken, ownership_key : ucwid) => Promise<boolean>;
    destroy_session : (t_token : TransitionToken) => void
    add_transferable_token : ( t_token : TransitionToken, value : string | object, ownership_key : ucwid ) => Promise<void>
    token_is_transferable : (t_token : TransitionToken)  =>  boolean
    transfer_token : ( t_token : TransitionToken, yielder_key : ucwid,  receiver_key : ucwid ) => void
    set_general_session_timeout : (timeout : Number) => void
    set_session_timeout : (session_token : SessionToken,timeout : Number) => void
    get_session_timeout : (session_token : SessionToken) => Number | undefined
    get_session_time_left : (session_token : SessionToken) => Number | undefined
    allow_session_detach : (session_token : SessionToken) => void
    detach_session : (session_token : SessionToken) => void
    attach_session : (session_token : SessionToken) => void
    set_general_token_timeout : (timeout : Number) => void
    set_disownment_token_timeout : (t_token : TransitionToken,timeout : Number) => void
    set_token_timeout : (t_token : TransitionToken,timeout : Number) => void
    get_token_timeout : (t_token : TransitionToken)  =>  Number | undefined 
    set_token_sellable : (t_token : TransitionToken, amount? : Number) => void
    unset_token_sellable : (t_token : TransitionToken) => void
    list_tranferable_tokens : (session_token : SessionToken) => TransitionToken[]
    list_sellable_tokens : () => TransitionToken[];
    list_unassigned_tokens : () => TransitionToken[]
    list_detached_sessions : () => SessionToken[]
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
 */

class LocalSessionTokens implements LocalSessionTokensAbstract {

    _db : DB;
    //
    _session_to_owner : Map<SessionToken,ucwid>;
    _owner_to_session : Map<ucwid,SessionToken>;  
    _token_to_owner : Map<Token,ucwid>;
    _token_to_session : Map<TransitionToken,SessionToken>;
    _session_checking_tokens : Map<SessionToken,string>;
    _token_to_information : Map<TransitionToken,string>;
    _sessions_to_their_tokens :  Map<SessionToken,SessionTokenSets>;
    //
    _detached_sessions :  Set<SessionToken>;

    _orphaned_tokens : Set<TransitionToken>;
    //
    _all_tranferable_tokens : Map<TransitionToken,TransferableTokenInfo>;
    //
    _token_timing : Map<TransitionToken,TokenTimingInfo>;
    _session_timing : Map<SessionToken,SessionTimingInfo>;

    //
    _token_creator : token_lambda;
    //
    _general_session_timeout : Number;
    _session_time_chopper : Number;

    _general_token_timeout : Number;

    /**
    * @constructor
    * @param {DB} db_obj - A database reference which supports get, set, del for ephemeral and long timed LRU.
    * @param {token_lambda} [token_creator] - A method for making a token which will be used as a unique key into the database.
    */
   constructor(db_obj : DB, token_creator: token_lambda | undefined) {
        this._db = db_obj
        //
        this._session_to_owner = new Map<SessionToken,ucwid>();      // map to owner
        this._owner_to_session = new Map<ucwid,SessionToken>();  
        this._token_to_owner = new Map<TransitionToken,ucwid>();        // map to owner -- token belongs to owner (ucwid)
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
        this._session_time_chopper = setInterval(this.decrement_timers,SESSION_CHOP_INTERVAL)
        this._general_token_timeout = Infinity
    }


    /**
     * 
     */
    decrement_timers() {
        for ( let [sess_tok,time_info] of Object.entries(this._session_timing) ) {
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
                    time_info.time_left = time_left
                }
            }
        }
        for ( let [t_tok,time_info] of Object.entries(this._token_timing) ) {
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
                    time_info.time_left = time_left
                }
            }
        }
    }

    /**
     *  Calls upon the instance lambda in order to create a token for whatever use is intended.
     * @param {string} [prefix] - optionally put prefix the token whith an applicatino specfic string
     * @returns {token} -- a unique identifier relative to the running application scope (defind by the application)
     */
    create_token( prefix? : string ) : Token {
        return this._token_creator(prefix)
    }



    /**
     * Given a transition token, adds it to the local tables plus the key value database.
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
            this._token_timing.set(t_token,new TokenTimingInfo())
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
                let key = await this._db.get_key_value(t_token)
                if ( (key === null) || (key === false) ) {
                    return (false)
                } else {
                    await this.add_token(t_token,key as string)
                    return (key)
                }
            }
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
                this._db.del_key_value(t_token)
                this._token_to_owner.delete(t_token)
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

   /**
    * Fetch the ownership key belonging to a token
    * @param {string} token - An ephemeral token for transitions sequences.
    * @returns {string} - the ownership key of the token e.g. a ucwid
    */
    from_token(t_token : TransitionToken) : ucwid {
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
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     */
    async add_session(session_token : SessionToken, ownership_key : ucwid, t_token : TransitionToken ) {
        // hash_of_p2  hash of the second parameter per the hasher provided by the caching module
        // e.g.hh unidentified (an intermediate hash) in LRU manager of global_session
        let hash_of_p2 = await this._db.set_session_key_value(session_token,ownership_key)  // return hh unidentified == xxhash of value (value == ownership key)
        // later the session_token will be passed into get_session_key_value where it will be hashed into an augmented has token
        // for fetching hash_of_p2
        this._session_to_owner.set(session_token,ownership_key) // the session transition token 
        this._session_checking_tokens.set(session_token,hash_of_p2)
        this._token_to_owner.set(session_token,ownership_key)
        let sess_token_set = new SessionTokenSets()
        this._sessions_to_their_tokens.set(session_token,sess_token_set);
        //
        if ( t_token ) {
            this._token_to_session.set(t_token, session_token)
            sess_token_set.session_bounded.add(t_token)
            this._token_to_owner.set(t_token,ownership_key)
            await this.add_token(t_token, hash_of_p2)  
        }
        //
        this._session_timing.set(session_token,new SessionTimingInfo(this._general_session_timeout))
    }

    
    /**
     * Uses the hash value mapped by the session token along with the expected hash input to check for existence of the session
     */
    async active_session(session_token : SessionToken, ownership_key : ucwid) : Promise<boolean> {
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
                this._session_timing.delete(session_token)

                let token_sets : SessionTokenSets | undefined = this._sessions_to_their_tokens.get(session_token)
                if ( token_sets !== undefined ) {
                    for ( let token in token_sets.session_carries ) {
                        this._orphaned_tokens.add(token)
                    }
                    for ( let token in token_sets.session_bounded ) {
                        this.destroy_token(token)
                    }
                }
                this._sessions_to_their_tokens.delete(session_token);
                //
                this._db.del_session_key_value(session_token)
           } catch (e) {
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
    async add_transferable_token( t_token : TransitionToken, value : string | object, ownership_key : ucwid ) {
        let session_token : SessionToken | undefined = this._owner_to_session.get(ownership_key)
        if ( session_token !== undefined ) {
            let sess_token_set = this._sessions_to_their_tokens.get(session_token);
            if ( t_token && sess_token_set ) {
                this._token_to_session.set(t_token, session_token)
                sess_token_set.session_carries.add(t_token)
                this._all_tranferable_tokens.set(t_token,new TransferableTokenInfo()) // if it is in this set, it is transferable
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
    async transfer_token( t_token : TransitionToken, yielder_key : ucwid,  receiver_key : ucwid ) : Promise<void> {
        if ( t_token && yielder_key && receiver_key ) {
            //
            let y_session_token = this._owner_to_session.get(yielder_key)
            if ( y_session_token ) {
                let sess_token_set = this._sessions_to_their_tokens.get(y_session_token);
                if ( sess_token_set && sess_token_set.session_carries.has(t_token) ) {
                    //
                    this.destroy_token(t_token)
                    //
                    let r_session_token = this._owner_to_session.get(receiver_key)
                    if ( r_session_token ) {        // the receiver has to have an active session seen from this runtime
                        this._token_to_session.set(t_token,r_session_token)
                        let sess_token_set = this._sessions_to_their_tokens.get(y_session_token);
                        sess_token_set?.session_carries.add(t_token)
                        this._token_to_owner.set(t_token,receiver_key)
                    }
                }
            }  // no else --- there has to be an agent to transfer the ownerhip of a token
            //
        }
    }


    // --- session timing 

    /**
     * 
     * @param timeout 
     */
    set_general_session_timeout(timeout : Number) : void  {
        this._general_session_timeout = timeout
    }

    // per session 
    /**
     * 
     * @param session_token 
     * @param timeout 
     */
    set_session_timeout(session_token : SessionToken,timeout : Number) : void {
        let s_time_info = this._session_timing.get(session_token)
        if ( s_time_info !== undefined ) {
            s_time_info._time_allotted = timeout
            s_time_info._time_left = timeout
        }
    }

    /**
     * 
     * @param session_token 
     * @returns 
     */
    get_session_timeout(session_token : SessionToken) : Number | undefined {
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
    get_session_time_left(session_token : SessionToken) : Number | undefined {
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
        }
    }

    // --- token timing 

    /**
     * 
     * @param timeout 
     */
    set_general_token_timeout(timeout : Number) : void {
        this._general_token_timeout = timeout
    }

    /**
     * 
     * @param t_token 
     * @param timeout 
     */
    set_disownment_token_timeout(t_token : TransitionToken,timeout : Number) : void {
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
    set_token_timeout(t_token : TransitionToken,timeout : Number) : void {
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
    get_token_timeout(t_token : TransitionToken) : Number | undefined {
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
    get_token_time_left(t_token : TransitionToken) : Number | undefined {
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

    /**
     * 
     * @param session_token 
     * @returns 
     */
    list_tranferable_tokens(session_token : SessionToken) : TransitionToken[] {
        let sess_info = this._session_timing.get(session_token)
        if ( (sess_info !== undefined) && (sess_info._detachment_allowed) ) {
            let sess_token_set = this._sessions_to_their_tokens.get(session_token);
            if ( sess_token_set ) {
                return Array.from(sess_token_set.session_carries)
            }
        }
        return []
    }

    /**
     * 
     * @returns 
     */
    list_sellable_tokens() : TransitionToken[] {
        let transferables = Array.from(Object.keys(this._all_tranferable_tokens))
        transferables = transferables.filter((tok_key) => {
            let t_inf = this._all_tranferable_tokens.get(tok_key)
            if ( t_inf !== undefined ) {
                return t_inf._sellable
            }
        })
        return transferables
    }


    /**
     * 
     * @returns 
     */
    list_unassigned_tokens() : TransitionToken[] {
        return Array.from(this._orphaned_tokens)
    }


    /**
     * 
     * @returns 
     */
    list_detached_sessions() : SessionToken[] {
        return Array.from(this._detached_sessions)
    }


}



class lilDB implements DB {

    set_session_key_value : (session_token : SessionToken, ownership_key : ucwid) => hash;
    del_session_key_value : (session_token : SessionToken) => Promise<boolean>;
    set_key_value : (t_token : TransitionToken, value :string) => void;
    get_key_value : (t_token : TransitionToken) => Promise<string | boolean>;
    del_key_value : (t_token : TransitionToken) => void;
    check_hash  :   (hh_unidentified : string, ownership_key : ucwid) => Promise<boolean>;

    constructor(spec) {
        let self = this
        for ( let [fn,lambda] of Object.entries(spec) ) {
            self[fn] = lambda
        }
    }

  }

let db = new lilDB({
    set_session_key_value : (session_token : SessionToken, ownership_key : ucwid) => { "" },
    del_session_key_value : async (session_token : SessionToken) =>  { return true },
    set_key_value : (t_token : TransitionToken, value :string) => {},
    get_key_value : (t_token : TransitionToken) => { false },
    del_key_value : (t_token : TransitionToken) => {},
    check_hash  :   async (hh_unidentified : string, ownership_key : ucwid) => { true }
})


new LocalSessionTokens(db,default_token_maker)