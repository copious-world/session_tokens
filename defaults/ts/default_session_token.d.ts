import { DB } from './iDB';
declare type Hash = string;
declare type SessionToken = string;
declare type TransitionToken = string;
declare type Ucwid = string;
declare type Token = TransitionToken | SessionToken;
/**
 * @callback token_lambda -- a method that generates a token from a random number generator... does not make a hash
 * @param {string} [prefix] -- optionally prefix the token whith an application specfic string
 * @returns {Token} -- a unique identifier relative to the running application scope (defind by the application)
 */
declare type token_lambda = (prefix?: string) => Token;
/**
 * Collects all the tokens belonging to a session into one data structure.
 * This object refers to two sets
 * 1. one that contains the tokens that must be destroyed when the session is destroyed.
 * 2. a second that contains the tokens that may be transfered to another session and owner.
 */
declare class SessionTokenSets {
    session_bounded: Set<TransitionToken>;
    session_carries: Set<TransitionToken>;
    constructor();
}
/**
 * Transferable tokens may be moved to another owner at any time a session owner allows it.
 * By virue of being in a set of transferable tokens, the token is tansferable.
 * The token may additionally be sellable at some price, which may positive or negative.
 * Other useful properties may be added later that apply only to transferable tokens.
 */
declare class TransferableTokenInfo {
    _sellable: boolean;
    _price: Number;
    _owner: Ucwid;
    constructor(owner: Ucwid);
    set_all(stored_info: Object): void;
}
/**
 * There are several situations in which a sesion may be used in a time-sensitive way.
 * This class puts them in a single record for storage in a sinlge local table.
 * Many times, a token's timing roles may be manipulated at once. Hence, keeping the token in a table for each case
 * will increase the algorithmic time a token's updates will require.
 */
declare class SessionTimingInfo {
    _detachment_allowed: boolean;
    _is_detached: boolean;
    _time_left: number;
    _time_left_after_detachment: number;
    _time_allotted: number;
    _shared: boolean;
    constructor(default_timeout: number);
    set_all(stored_info: Object): void;
}
/**
 * There are several situations in which a token may be used in a time-sensitive way.
 * This class puts them in a single record for storage in a sinlge local table.
 * Many times, a token's timing roles may be manipulated at once. Hence, keeping the token in a table for each case
 * will increase the algorithmic time a token's updates will require.
 */
declare class TokenTimingInfo {
    _detachment_allowed: boolean;
    _is_detached: boolean;
    _time_left: number;
    _time_left_after_detachment: number;
    _time_allotted: number;
    constructor();
    set_all(stored_info: Object): void;
}
/**
 * Maintaining an abstract interface if only to establish a gazetter into the methods and
 * provide interface structures for translations to other languages using, e.g., traits, abstract classes, etc.
 */
export interface TokenTablesAbstract {
    decrement_timers: () => void;
    set_token_creator: (token_creator: token_lambda | undefined) => void;
    add_session: (session_token: SessionToken, ownership_key: Ucwid, t_token: TransitionToken, shared?: boolean) => Promise<Hash | undefined>;
    active_session: (session_token: SessionToken, ownership_key: Ucwid) => Promise<boolean>;
    destroy_session: (t_token: TransitionToken) => void;
    allow_session_detach: (session_token: SessionToken) => void;
    detach_session: (session_token: SessionToken) => void;
    attach_session: (session_token: SessionToken) => void;
    create_token: (prefix?: string) => Token;
    add_token: (t_token: TransitionToken, value: string | object) => Promise<void>;
    transition_token_is_active: (t_token: TransitionToken) => Promise<boolean | string>;
    from_token: (t_token: TransitionToken) => Ucwid;
    add_transferable_token: (t_token: TransitionToken, value: string | object, ownership_key: Ucwid) => Promise<void>;
    add_session_bounded_token: (t_token: TransitionToken, value: string | object, ownership_key: Ucwid) => Promise<void>;
    acquire_token: (t_token: TransitionToken, session_token: SessionToken, owner: Ucwid) => Promise<boolean>;
    token_is_transferable: (t_token: TransitionToken) => boolean;
    transfer_token: (t_token: TransitionToken, yielder_key: Ucwid, receiver_key: Ucwid) => void;
    destroy_token: (t_token: TransitionToken) => void;
    set_general_session_timeout: (timeout: number) => void;
    set_session_timeout: (session_token: SessionToken, timeout: number) => void;
    get_session_timeout: (session_token: SessionToken) => number | undefined;
    get_session_time_left: (session_token: SessionToken) => number | undefined;
    set_general_token_timeout: (timeout: number) => void;
    set_disownment_token_timeout: (t_token: TransitionToken, timeout: number) => void;
    set_token_timeout: (t_token: TransitionToken, timeout: number) => void;
    get_token_timeout: (t_token: TransitionToken) => number | undefined;
    get_token_time_left(t_token: TransitionToken): number | undefined;
    set_token_sellable: (t_token: TransitionToken, amount?: Number) => void;
    unset_token_sellable: (t_token: TransitionToken) => void;
    reload_session_info(session_token: SessionToken, ownership_key: Ucwid, hash_of_p2: Hash): Promise<boolean>;
    reload_token_info(t_token: TransitionToken): Promise<void>;
    list_tranferable_tokens: (session_token: SessionToken) => TransitionToken[];
    list_sellable_tokens: () => TransitionToken[];
    list_unassigned_tokens: () => TransitionToken[];
    list_detached_sessions: () => SessionToken[];
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
export declare class TokenTables implements TokenTablesAbstract {
    _db: DB;
    _session_to_owner: Map<SessionToken, Ucwid>;
    _owner_to_session: Map<Ucwid, SessionToken>;
    _session_checking_tokens: Map<SessionToken, string>;
    _detached_sessions: Set<SessionToken>;
    _token_to_owner: Map<Token, Ucwid>;
    _token_to_session: Map<TransitionToken, SessionToken>;
    _sessions_to_their_tokens: Map<SessionToken, SessionTokenSets>;
    _token_to_information: Map<TransitionToken, string>;
    _orphaned_tokens: Set<TransitionToken>;
    _all_tranferable_tokens: Map<TransitionToken, TransferableTokenInfo>;
    _token_timing: Map<TransitionToken, TokenTimingInfo>;
    _session_timing: Map<SessionToken, SessionTimingInfo>;
    _session_time_chopper: number;
    _general_session_timeout: number;
    _general_token_timeout: number;
    _token_creator: token_lambda;
    /**
    * @constructor
    * @param {DB} db_obj - A database reference which supports get, set, del for ephemeral and long timed LRU.
    * @param {token_lambda} [token_creator] - A method for making a token which will be used as a unique key into the database.
    */
    constructor(db_obj: DB, token_creator: token_lambda | undefined);
    /**
     *
     */
    shutdown(): void;
    /**
     *
     */
    decrement_timers(): void;
    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * *Recommendation*: if using the returned value, it should be kept safe and sent via a communication channel to cooperating micro services
     *
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {Ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     * @param {bool} [shared] - if supplied, then information about the session will be stored in a shared DB
     * @returns {Promise<Hash | undefined> } If the share parameter is used, then this willbe a key for checking the activity of the session.
     */
    add_session(session_token: SessionToken, ownership_key: Ucwid, t_token: TransitionToken, shared?: boolean): Promise<Hash | undefined>;
    /**
     * Uses the hash value mapped by the session token along with the expected hash input to check for existence of the session
     */
    active_session(session_token: SessionToken, ownership_key: Ucwid): Promise<boolean>;
    /**
    *  Removes a sessions from the general discourse of all micro services given the state transition token that that keys the session
    *  @param {string} token - a token that keys the state transitions of a session and can map to the session
    */
    destroy_session(t_token: TransitionToken): void;
    /**
     *  Calls upon the instance lambda in order to create a token for whatever use is intended.
     * @param {string} [prefix] - optionally put prefix the token whith an applicatino specfic string
     * @returns {token} -- a unique identifier relative to the running application scope (defind by the application)
     */
    create_token(prefix?: string): Token;
    /**
     * Provided if any lazy configuration requirement must set the token creator after construction
     * @param token_creator
     */
    set_token_creator(token_creator: token_lambda | undefined): void;
    /**
     * Given a transition token, adds it to the local tables plus the key value database.
     * @param {TransitionToken} token - a transition token which be part of a transition object.
     * @param {string} value - any string value less than a pre-determined size that can be stored.
     */
    add_token(t_token: TransitionToken, value: string | object): Promise<void>;
    /**
     *
     * @param token
     * @returns Promise<boolean | string>
     */
    transition_token_is_active(t_token: TransitionToken): Promise<boolean | string>;
    /**
     * Fetch the ownership key belonging to a token
     * @param {string} token - An ephemeral token for transitions sequences.
     * @returns {string} - the ownership key of the token e.g. a Ucwid
     */
    from_token(t_token: TransitionToken): Ucwid;
    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {Ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     */
    add_transferable_token(t_token: TransitionToken, value: string | object, ownership_key: Ucwid): Promise<void>;
    /**
     * Given a session_token, adds it to the local tables plus the session database. Stores the database hash in maps indexed by
     * the session_token and by the ownership_key.
     * @param {TransitionToken} t_token -- a key into the token tables from which the session should be recoverable.
     * @param {SessionToken} session_token -- a token identifiying a session typically returned by a login process -- not a transition token
     * @param {Ucwid} ownership_key -- a string representation of an ownership ID such as a DID.
     */
    add_session_bounded_token(t_token: TransitionToken, value: string | object, ownership_key: Ucwid): Promise<void>;
    /**
     *
     * @param t_token
     * @returns
     */
    token_is_transferable(t_token: TransitionToken): boolean;
    /**
     * Sets up a local transfer of token ownership
     * @param t_token
     * @param yielder_key
     * @param receiver_key
     */
    transfer_token(t_token: TransitionToken, yielder_key: Ucwid, receiver_key: Ucwid): Promise<void>;
    /**
     * If a process has been granted a token, it will have info stored in the shared DB
     * But, it will not be in local tables, which will be used to identify it.
     * @param t_token
     * @param session_token
     * @param owner
     * @returns
     */
    acquire_token(t_token: TransitionToken, session_token: SessionToken, owner: Ucwid): Promise<boolean>;
    /**
     * Given a transition token, removes it from the local tables plus the key value database.
     * @param {TransitionToken} token - a transition token which be part of a transition object.
     */
    destroy_token(t_token: TransitionToken): void;
    /**
     *
     * @param timeout
     */
    set_general_session_timeout(timeout: number): void;
    /**
     *
     * @param session_token
     * @param timeout
     */
    set_session_timeout(session_token: SessionToken, timeout: number): void;
    /**
     *
     * @param session_token
     * @returns
     */
    get_session_timeout(session_token: SessionToken): number | undefined;
    /**
     *
     * @param session_token
     * @returns
     */
    get_session_time_left(session_token: SessionToken): number | undefined;
    /**
     *
     * @param session_token
     */
    allow_session_detach(session_token: SessionToken): void;
    /**
     *
     * @param session_token
     */
    detach_session(session_token: SessionToken): void;
    /**
     *
     * @param session_token
     */
    attach_session(session_token: SessionToken): void;
    /**
     *
     * @param timeout
     */
    set_general_token_timeout(timeout: number): void;
    /**
     *
     * @param t_token
     * @param timeout
     */
    set_disownment_token_timeout(t_token: TransitionToken, timeout: number): void;
    /**
     *
     * @param t_token
     * @param timeout
     */
    set_token_timeout(t_token: TransitionToken, timeout: number): void;
    /**
     *
     * @param t_token
     * @returns
     */
    get_token_timeout(t_token: TransitionToken): number | undefined;
    /**
     *
     * @param t_token
     * @returns
     */
    get_token_time_left(t_token: TransitionToken): number | undefined;
    /**
     *
     * @param t_token
     * @param amount
     */
    set_token_sellable(t_token: TransitionToken, amount?: Number): void;
    /**
     *
     * @param t_token
     */
    unset_token_sellable(t_token: TransitionToken): void;
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
    reload_session_info(session_token: SessionToken, ownership_key: Ucwid, hash_of_p2: Hash): Promise<boolean>;
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
    reload_token_info(t_token: TransitionToken): Promise<void>;
    /**
     *
     * @param session_token
     * @returns
     */
    list_tranferable_tokens(session_token: SessionToken): TransitionToken[];
    /**
     *
     * @returns
     */
    list_sellable_tokens(): TransitionToken[];
    /**
     *
     * @returns
     */
    list_unassigned_tokens(): TransitionToken[];
    /**
     *
     * @returns
     */
    list_detached_sessions(): SessionToken[];
}
export {};
